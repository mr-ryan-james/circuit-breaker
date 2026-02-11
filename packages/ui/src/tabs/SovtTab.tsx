import React, { useMemo, useRef, useState } from "react";

import type { SovtCmdStep } from "@/app/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ActivityDot } from "@/components/ActivityDot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RecordingControls } from "@/components/RecordingControls";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SessionBanner } from "@/components/SessionBanner";

import { callAction } from "@/api/client";
import { PitchTimeline } from "@/components/PitchTimeline";
import { formatMmSs } from "@/lib/format";
import { cn } from "@/lib/utils";

type NoteEvent = { idx: number; start_ms: number; duration_ms: number; midi: number; hz: number; note: string };
type NoteAnalysis = { duration_ms: number; note_events: NoteEvent[]; bpm?: number };

function centsDiff(actualHz: number, expectedHz: number): number {
  return 1200 * Math.log2(actualHz / expectedHz);
}

function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  if (v.length % 2 === 1) return v[mid] ?? null;
  const a = v[mid - 1];
  const b = v[mid];
  if (a === undefined || b === undefined) return null;
  return (a + b) / 2;
}

function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Minimal YIN-style pitch detector (offline). Good enough for an MVP pitch check.
function detectPitchContour(
  samples: Float32Array,
  sampleRate: number,
  opts?: {
    frameSize?: number;
    hopSize?: number;
    minHz?: number;
    maxHz?: number;
    threshold?: number;
    gateDbfs?: number;
  },
) {
  const frameSize = opts?.frameSize ?? 2048;
  const hopSize = opts?.hopSize ?? 512;
  const minHz = opts?.minHz ?? 60;
  const maxHz = opts?.maxHz ?? 1400;
  const threshold = opts?.threshold ?? 0.12;
  const gateDbfs = opts?.gateDbfs ?? -40;

  const tauMin = Math.max(2, Math.floor(sampleRate / maxHz));
  const tauMax = Math.min(frameSize - 2, Math.floor(sampleRate / minHz));

  const contour: Array<{ t_ms: number; hz: number | null; clarity: number }> = [];

  const diff = new Float32Array(tauMax + 1);
  const cmnd = new Float32Array(tauMax + 1);

  for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
    const frame = samples.subarray(start, start + frameSize);

    // RMS gate (skip pitch detection for silent frames).
    let sumSq = 0;
    for (let i = 0; i < frame.length; i += 1) {
      const x = frame[i] ?? 0;
      sumSq += x * x;
    }
    const rms = frame.length > 0 ? Math.sqrt(sumSq / frame.length) : 0;
    const dbfs = rms > 0 ? 20 * Math.log10(rms) : -Infinity;

    const tMs = Math.round((start / sampleRate) * 1000);
    if (dbfs < gateDbfs) {
      contour.push({ t_ms: tMs, hz: null, clarity: 0 });
      continue;
    }

    // Difference function d(tau)
    diff.fill(0);
    for (let tau = tauMin; tau <= tauMax; tau += 1) {
      let sum = 0;
      for (let i = 0; i < frameSize - tau; i += 1) {
        const d = frame[i]! - frame[i + tau]!;
        sum += d * d;
      }
      diff[tau] = sum;
    }

    // CMND
    cmnd[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= tauMax; tau += 1) {
      running += diff[tau]!;
      cmnd[tau] = running > 0 ? (diff[tau]! * tau) / running : 1;
    }

    // Pick first tau under threshold (local minimum-ish)
    let tauEstimate: number | null = null;
    for (let tau = tauMin; tau <= tauMax; tau += 1) {
      const v = cmnd[tau]!;
      if (v < threshold) {
        // Walk to local minimum
        let bestTau = tau;
        let best = v;
        while (bestTau + 1 <= tauMax && cmnd[bestTau + 1]! < best) {
          bestTau += 1;
          best = cmnd[bestTau]!;
        }
        tauEstimate = bestTau;
        break;
      }
    }

    let hz: number | null = null;
    let clarity = 0;
    if (tauEstimate !== null) {
      const t0 = tauEstimate;
      // Parabolic interpolation around CMND minimum for sub-sample precision.
      const x0 = t0 > 1 ? cmnd[t0 - 1]! : cmnd[t0]!;
      const x1 = cmnd[t0]!;
      const x2 = t0 + 1 <= tauMax ? cmnd[t0 + 1]! : cmnd[t0]!;
      const denom = (x0 - 2 * x1 + x2);
      const delta = denom !== 0 ? (x0 - x2) / (2 * denom) : 0;
      const tauRefined = t0 + delta;
      hz = tauRefined > 0 ? sampleRate / tauRefined : null;
      clarity = Math.max(0, Math.min(1, 1 - x1));
      if (hz !== null && (hz < minHz || hz > maxHz)) hz = null;
    }

    contour.push({ t_ms: tMs, hz, clarity });
  }

  // 3-frame median smoothing in MIDI space to reduce octave spikes.
  const midiSeq = contour.map((p) => (p.hz ? hzToMidi(p.hz) : null));
  const smoothed = contour.map((p, i) => {
    if (!p.hz) return p;
    const window: number[] = [];
    const a = midiSeq[i - 1];
    const b = midiSeq[i];
    const c = midiSeq[i + 1];
    if (typeof a === "number") window.push(a);
    if (typeof b === "number") window.push(b);
    if (typeof c === "number") window.push(c);
    if (window.length < 2) return p;
    const m = median(window);
    if (m === null) return p;
    return { ...p, hz: midiToHz(m) };
  });

  return smoothed;
}

async function decodeRecordedAudio(blob: Blob): Promise<{ samples: Float32Array; sampleRate: number }> {
  const buf = await blob.arrayBuffer();
  const audioCtx = new AudioContext();
  try {
    const decoded = await audioCtx.decodeAudioData(buf.slice(0));
    const ch0 = decoded.getChannelData(0);
    if (decoded.numberOfChannels <= 1) {
      return { samples: ch0.slice(0), sampleRate: decoded.sampleRate };
    }
    // Average channels for a mono contour.
    const out = new Float32Array(ch0.length);
    for (let i = 0; i < out.length; i += 1) {
      let sum = 0;
      for (let c = 0; c < decoded.numberOfChannels; c += 1) {
        sum += decoded.getChannelData(c)[i] ?? 0;
      }
      out[i] = sum / decoded.numberOfChannels;
    }
    return { samples: out, sampleRate: decoded.sampleRate };
  } finally {
    await audioCtx.close().catch(() => {});
  }
}

type PitchFrame = { t_ms: number; hz: number | null; clarity: number };

const PITCH_CLARITY_THRESHOLD = 0.65;
const PITCH_OK_CENTS = 35;

function computePerNoteResults(contour: PitchFrame[], expected: NoteEvent[], offsetMs: number) {
  return expected.map((ev) => {
    const start = ev.start_ms + offsetMs;
    const end = start + ev.duration_ms;
    const values = contour
      .filter((p) => p.hz !== null && p.clarity >= PITCH_CLARITY_THRESHOLD && p.t_ms >= start && p.t_ms <= end)
      .map((p) => p.hz as number)
      .filter((hz) => hz >= 60 && hz <= 1400);
    const det = median(values);
    const cents = det ? centsDiff(det, ev.hz) : null;
    const ok = cents !== null ? Math.abs(cents) <= PITCH_OK_CENTS : false;
    return { idx: ev.idx, note: ev.note, expected_hz: ev.hz, detected_hz: det, cents, ok, start_ms: start, end_ms: end };
  });
}

function scoreOffset(contour: PitchFrame[], expected: NoteEvent[], offsetMs: number): { ok_ratio: number; ok_count: number; note_count: number } {
  const per = computePerNoteResults(contour, expected, offsetMs);
  const okCount = per.filter((p) => p.ok).length;
  const noteCount = per.length;
  const okRatio = noteCount > 0 ? okCount / noteCount : 0;
  return { ok_ratio: okRatio, ok_count: okCount, note_count: noteCount };
}

function autoAlignOffsetMs(contour: PitchFrame[], expected: NoteEvent[]): number {
  if (expected.length === 0) return 0;

  const chooseBest = (offsets: number[]): number => {
    let best = offsets[0] ?? 0;
    let bestScore = -1;
    for (const off of offsets) {
      const s = scoreOffset(contour, expected, off);
      const score = s.ok_ratio;
      if (score > bestScore) {
        bestScore = score;
        best = off;
        continue;
      }
      if (score === bestScore && Math.abs(off) < Math.abs(best)) {
        best = off;
      }
    }
    return best;
  };

  const coarse: number[] = [];
  for (let off = -2000; off <= 2000; off += 100) coarse.push(off);
  const coarseBest = chooseBest(coarse);

  const fine: number[] = [];
  for (let off = coarseBest - 200; off <= coarseBest + 200; off += 25) fine.push(off);
  return chooseBest(fine);
}

export function SovtTab(props: {
  breakMenuLoaded: boolean;
  sovtCard: any | null;
  sovtEventKey: string | null;
  sovtError: string | null;
  sovtCompletion: any | null;
  sovtSteps: SovtCmdStep[];

  chooseBreakLaneAndStartSovt: () => void;
  onGoToBreakTab: () => void;
  runSovtCmd: (stepIdx: number) => Promise<void>;
  completeSovt: (status: "completed" | "abandoned") => void;
}) {
  const {
    breakMenuLoaded,
    sovtCard,
    sovtEventKey,
    sovtError,
    sovtCompletion,
    sovtSteps,
    chooseBreakLaneAndStartSovt,
    onGoToBreakTab,
    runSovtCmd,
    completeSovt,
  } = props;

  const [noteAnalysis, setNoteAnalysis] = useState<NoteAnalysis | null>(null);
  const [noteAnalysisStepIdx, setNoteAnalysisStepIdx] = useState<number | null>(null);
  const [pitchOffsetMs, setPitchOffsetMs] = useState<number>(0);
  const [pitchOffsetTouched, setPitchOffsetTouched] = useState(false);
  const [pitchAutoOffsetMs, setPitchAutoOffsetMs] = useState<number | null>(null);
  const [pitchError, setPitchError] = useState<string | null>(null);
  const [pitchContour, setPitchContour] = useState<Array<{ t_ms: number; hz: number | null; clarity: number }> | null>(null);
  const [pitchHistory, setPitchHistory] = useState<any[] | null>(null);

  const [pitchRecording, setPitchRecording] = useState(false);
  const [pitchRecordingStartedAtMs, setPitchRecordingStartedAtMs] = useState<number | null>(null);
  const [pitchRecordingElapsedMs, setPitchRecordingElapsedMs] = useState<number>(0);
  const [pendingEndStatus, setPendingEndStatus] = useState<"completed" | "abandoned" | null>(null);

  const [pitchResults, setPitchResults] = useState<
    | null
    | {
        offset_ms: number;
        auto_offset_ms: number | null;
        duration_ms: number;
        contour_points: number;
        per_note: Array<{
          idx: number;
          note: string;
          expected_hz: number;
          detected_hz: number | null;
          cents: number | null;
          ok: boolean;
          start_ms: number;
          end_ms: number;
        }>;
        note_count: number;
        ok_count: number;
        ok_ratio: number;
      }
  >(null);

  const recorderRef = useRef<{
    stream: MediaStream;
    mediaRecorder: MediaRecorder;
    chunks: Blob[];
  } | null>(null);

  React.useEffect(() => {
    if (!pitchRecording || !pitchRecordingStartedAtMs) return;
    const id = window.setInterval(() => {
      setPitchRecordingElapsedMs(Math.max(0, Date.now() - pitchRecordingStartedAtMs));
    }, 200);
    return () => window.clearInterval(id);
  }, [pitchRecording, pitchRecordingStartedAtMs]);

  React.useEffect(() => {
    // Best-effort: load recent pitch checks so progress is visible across reloads.
    void (async () => {
      try {
        const res = await callAction<any>("sovt.pitch.history", { limit: 10 });
        if (res?.ok && Array.isArray(res.results)) setPitchHistory(res.results);
      } catch {
        // ignore
      }
    })();
  }, []);

  // If the user adjusts the offset after analysis, recompute grading and keep the chart/results in sync.
  React.useEffect(() => {
    if (!pitchContour) return;
    if (!noteAnalysis || (noteAnalysis.note_events?.length ?? 0) === 0) return;
    setPitchResults((prev) => {
      if (!prev) return prev;
      const perNote = computePerNoteResults(pitchContour, noteAnalysis.note_events, pitchOffsetMs);
      const okCount = perNote.filter((p) => p.ok).length;
      const noteCount = perNote.length;
      const okRatio = noteCount > 0 ? okCount / noteCount : 0;
      return {
        ...prev,
        offset_ms: pitchOffsetMs,
        per_note: perNote,
        note_count: noteCount,
        ok_count: okCount,
        ok_ratio: okRatio,
      };
    });
  }, [pitchOffsetMs, pitchContour, noteAnalysis]);

  const canAnalyzeNotes = (step: SovtCmdStep): boolean => Array.isArray(step.args) && step.args[0] === "play";

  async function analyzeExpectedNotesForStep(step: SovtCmdStep): Promise<void> {
    setPitchError(null);
    setPitchResults(null);
    setPitchContour(null);
    setPitchAutoOffsetMs(null);
    setPitchOffsetTouched(false);
    setPitchOffsetMs(0);
    setNoteAnalysis(null);
    setNoteAnalysisStepIdx(null);
    try {
      if (!canAnalyzeNotes(step)) throw new Error("Only play commands can be analyzed");
      const args = [...step.args, "--no-play", "--notes-json"];
      const res = await callAction<any>("sovt.play", { args });
      if (!res?.ok) throw new Error(String(res?.error ?? "sovt.play failed"));
      const note_events = Array.isArray(res.note_events) ? (res.note_events as NoteEvent[]) : [];
      const duration_ms = typeof res.duration_ms === "number" ? res.duration_ms : 0;
      setNoteAnalysis({ note_events, duration_ms, bpm: typeof res.bpm === "number" ? res.bpm : undefined });
      setNoteAnalysisStepIdx(step.idx);
    } catch (e: unknown) {
      setPitchError(e instanceof Error ? e.message : String(e));
    }
  }

  async function startPitchRecording(): Promise<void> {
    setPitchError(null);
    setPitchResults(null);
    if (pitchRecording) return;

    try {
      if (typeof MediaRecorder === "undefined") {
        throw new Error("MediaRecorder is not available in this browser");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } as any,
      });
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (evt) => {
        if (evt.data && evt.data.size > 0) chunks.push(evt.data);
      };
      mr.start();

      recorderRef.current = { stream, mediaRecorder: mr, chunks };
      setPitchRecording(true);
      setPitchRecordingStartedAtMs(Date.now());
      setPitchRecordingElapsedMs(0);
    } catch (e: unknown) {
      setPitchError(e instanceof Error ? e.message : String(e));
      recorderRef.current = null;
      setPitchRecording(false);
      setPitchRecordingStartedAtMs(null);
      setPitchRecordingElapsedMs(0);
    }
  }

  async function stopPitchRecordingAndAnalyze(): Promise<void> {
    setPitchError(null);
    const r = recorderRef.current;
    if (!r) return;

    const blob = await new Promise<Blob>((resolve) => {
      r.mediaRecorder.onstop = () => resolve(new Blob(r.chunks, { type: r.mediaRecorder.mimeType || "audio/webm" }));
      try {
        r.mediaRecorder.stop();
      } catch {
        resolve(new Blob(r.chunks));
      }
    });

    r.stream.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    setPitchRecording(false);
    setPitchRecordingStartedAtMs(null);
    setPitchRecordingElapsedMs(0);

    try {
      const expected = noteAnalysis?.note_events ?? [];
      if (expected.length === 0) throw new Error("No expected notes loaded. Click “Notes” on a CMD step first.");

      const decoded = await decodeRecordedAudio(blob);
      const contour = detectPitchContour(decoded.samples, decoded.sampleRate, {
        frameSize: 2048,
        hopSize: 512,
        minHz: 60,
        maxHz: 1400,
        gateDbfs: -40,
      });
      setPitchContour(contour);

      const autoOffset = autoAlignOffsetMs(contour, expected);
      setPitchAutoOffsetMs(autoOffset);

      const appliedOffset = pitchOffsetTouched ? pitchOffsetMs : autoOffset;
      if (!pitchOffsetTouched) setPitchOffsetMs(autoOffset);

      const perNote = computePerNoteResults(contour, expected, appliedOffset);
      const okCount = perNote.filter((p) => p.ok).length;
      const noteCount = perNote.length;
      const okRatio = noteCount > 0 ? okCount / noteCount : 0;

      const durationMs = Math.round((decoded.samples.length / decoded.sampleRate) * 1000);
      setPitchResults({
        offset_ms: appliedOffset,
        auto_offset_ms: autoOffset,
        duration_ms: durationMs,
        contour_points: contour.length,
        per_note: perNote,
        note_count: noteCount,
        ok_count: okCount,
        ok_ratio: okRatio,
      });

      // Best-effort persistence + history refresh.
      try {
        const step = noteAnalysisStepIdx ? (sovtSteps.find((s) => s.idx === noteAnalysisStepIdx) ?? null) : null;
        await callAction<any>("sovt.pitch.save", {
          card_id: sovtCard?.id ? Number(sovtCard.id) : undefined,
          event_key: sovtEventKey ?? undefined,
          step_idx: noteAnalysisStepIdx ?? undefined,
          step_title: step?.title ?? undefined,
          offset_ms: appliedOffset,
          auto_offset_ms: autoOffset,
          duration_ms: durationMs,
          ok_ratio: okRatio,
          note_count: noteCount,
          ok_count: okCount,
          contour_points: contour.length,
          per_note: perNote,
        });
        const hist = await callAction<any>("sovt.pitch.history", { limit: 10 });
        if (hist?.ok && Array.isArray(hist.results)) setPitchHistory(hist.results);
      } catch {
        // ignore
      }
    } catch (e: unknown) {
      setPitchError(e instanceof Error ? e.message : String(e));
    }
  }

  const hasNotes = (noteAnalysis?.note_events?.length ?? 0) > 0;

  const analyzedLabel = useMemo(() => {
    if (!noteAnalysisStepIdx) return null;
    const step = sovtSteps.find((s) => s.idx === noteAnalysisStepIdx) ?? null;
    if (!step) return `CMD ${noteAnalysisStepIdx}`;
    return `${step.idx}. ${step.title}`;
  }, [noteAnalysisStepIdx, sovtSteps]);

  const nextStep = useMemo(() => sovtSteps.find((s) => s.status === "pending" || s.status === "error") ?? null, [sovtSteps]);
  const completedStepCount = useMemo(() => sovtSteps.filter((s) => s.status === "done").length, [sovtSteps]);
  const hasAnyRunStep = useMemo(() => sovtSteps.some((s) => s.status === "done" || s.status === "error" || s.status === "running"), [sovtSteps]);
  const progressPct = sovtSteps.length > 0 ? Math.round((completedStepCount / sovtSteps.length) * 100) : 0;

  function stepStatusMeta(status: SovtCmdStep["status"]): { label: string; dotClass: string; pulse?: boolean } {
    switch (status) {
      case "pending":
        return { label: "Pending", dotClass: "border-muted-foreground/50 bg-background" };
      case "running":
        return { label: "Running", dotClass: "border-primary bg-primary", pulse: true };
      case "done":
        return { label: "Done", dotClass: "border-emerald-500 bg-emerald-500" };
      case "error":
        return { label: "Error", dotClass: "border-destructive bg-destructive" };
      default:
        return { label: status, dotClass: "border-muted-foreground/50 bg-muted-foreground/40" };
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>SOVT / Pitch</CardTitle>
        <CardDescription>Run SOVT card scripts in the browser (server plays audio locally via `site-toggle play`).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={chooseBreakLaneAndStartSovt}
            disabled={!breakMenuLoaded}
            title={!breakMenuLoaded ? "Load a break menu first." : undefined}
          >
            Load from Break menu (choose + start)
          </Button>
        </div>

        <SessionBanner
          active={Boolean(sovtCard?.id)}
          label={sovtCard ? `Loaded: ${String(sovtCard.activity ?? "SOVT")}` : "No exercise loaded"}
          rawId={sovtCard?.id ? `card:${String(sovtCard.id)}` : null}
          actions={
            <>
              <Button
                variant="secondary"
                onClick={() => setPendingEndStatus("completed")}
                disabled={!breakMenuLoaded || !sovtCard?.id || !hasAnyRunStep}
                title={!hasAnyRunStep ? "Run at least one step first." : undefined}
              >
                Complete
              </Button>
              <Button
                variant="outline"
                onClick={() => setPendingEndStatus("abandoned")}
                disabled={!breakMenuLoaded || !sovtCard?.id || !hasAnyRunStep}
                title={!hasAnyRunStep ? "Run at least one step first." : undefined}
              >
                Abandon
              </Button>
            </>
          }
        />

        <ErrorBanner message={sovtError} />

        {sovtCompletion ? (
          <Alert>
            <AlertTitle>Session updated</AlertTitle>
            <AlertDescription className="text-sm">
              Session marked as <b>{String(sovtCompletion?.session?.status ?? "completed")}</b>.
            </AlertDescription>
          </Alert>
        ) : null}

        {sovtCard ? (
          <div className="rounded-md border p-3">
            <div className="text-sm font-medium">{String(sovtCard.activity ?? "SOVT")}</div>
            <div className="text-xs text-muted-foreground">
              {sovtCard.minutes ?? "?"} min • {sovtCard.doneCondition ?? sovtCard.done_condition ?? ""}
            </div>
          </div>
        ) : (
          <Alert>
            <AlertTitle>No exercise loaded</AlertTitle>
            <AlertDescription className="space-y-2">
              <div className="text-sm text-muted-foreground">
                Go to the Break tab, load a break menu, then choose the SOVT lane.
              </div>
              <Button variant="outline" size="sm" onClick={onGoToBreakTab}>
                Go to Break tab
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {sovtCard ? (
          <>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="text-muted-foreground">
                  Progress: {completedStepCount} / {sovtSteps.length} steps
                </div>
                <Button
                  onClick={() => {
                    if (nextStep) void runSovtCmd(nextStep.idx);
                  }}
                  disabled={sovtSteps.some((s) => s.status === "running") || sovtSteps.length === 0 || !nextStep}
                >
                  {nextStep ? `Run next: \"${nextStep.idx}. ${nextStep.title}\"` : "Run next"}
                </Button>
              </div>
              <div className="h-2 w-full rounded bg-muted/40 overflow-hidden">
                <div className="h-full bg-primary/70 transition-all" style={{ width: `${progressPct}%` }} />
              </div>
              {sovtSteps.some((s) => s.status === "running") ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ActivityDot />
                  Running…
                </div>
              ) : null}
            </div>

            {sovtSteps.length === 0 ? (
              <div className="text-sm text-muted-foreground">No CMD steps parsed yet.</div>
            ) : (
              <div className="grid gap-2">
                {sovtSteps.map((s) => {
                  const meta = stepStatusMeta(s.status);
                  return (
                    <div key={s.idx} className="rounded-md border p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium">
                            {s.idx}. {s.title}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono break-all">{s.raw_cmd}</div>
                          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5">
                            <span className={cn("inline-block h-2.5 w-2.5 rounded-full border", meta.dotClass, meta.pulse && "animate-pulse")} />
                            <b>{meta.label}</b>
                            {s.started_at_ms ? ` • started ${formatMmSs(Date.now() - s.started_at_ms)} ago` : ""}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => void runSovtCmd(s.idx)}
                            disabled={s.status === "running" || sovtSteps.some((x) => x.status === "running")}
                          >
                            Run
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void analyzeExpectedNotesForStep(s)}
                            disabled={!canAnalyzeNotes(s) || s.status === "running"}
                          >
                            Notes
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={async () => {
                              setPitchError(null);
                              await analyzeExpectedNotesForStep(s);
                              await startPitchRecording();
                              try {
                                // Start playback after recording starts to minimize alignment drift.
                                await runSovtCmd(s.idx);
                              } finally {
                                await stopPitchRecordingAndAnalyze();
                              }
                            }}
                            disabled={!canAnalyzeNotes(s) || pitchRecording || s.status === "running"}
                          >
                            Run + Record
                          </Button>
                        </div>
                      </div>
                      {s.error ? <div className="mt-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">{s.error}</div> : null}
                      {s.result_json ? <pre className="mt-2 whitespace-pre-wrap rounded-md bg-muted/30 p-2 text-xs">{s.result_json}</pre> : null}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="rounded-md border p-3 space-y-3">
              <div>
                <div className="text-base font-semibold">Pitch Check</div>
                <div className="text-sm text-muted-foreground">
                  Record your mic and compare against expected notes. Use headphones to avoid capturing playback.
                </div>
              </div>

              {pitchError ? (
                <Alert variant="destructive">
                  <AlertTitle>Pitch error</AlertTitle>
                  <AlertDescription>{pitchError}</AlertDescription>
                </Alert>
              ) : null}

              <div className="flex flex-wrap items-end gap-2">
                <div className="grid gap-1.5">
                  <Label>Expected notes</Label>
                  <div className="text-sm text-muted-foreground">
                    {hasNotes ? (
                      <>
                        {analyzedLabel ?? "Loaded"} • {noteAnalysis?.note_events.length ?? 0} notes •{" "}
                        {formatMmSs(noteAnalysis?.duration_ms ?? 0)}
                      </>
                    ) : (
                      "Load a card and click Notes on a step to enable pitch analysis."
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="pitch-offset">Offset (ms)</Label>
                  <Input
                    id="pitch-offset"
                    type="number"
                    value={pitchOffsetMs}
                    onChange={(e) => {
                      setPitchOffsetTouched(true);
                      setPitchOffsetMs(Number(e.target.value));
                    }}
                    className="w-[140px]"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">Auto</Label>
                  <div className="text-sm text-muted-foreground font-mono">
                    {typeof pitchAutoOffsetMs === "number" ? `${pitchAutoOffsetMs} ms` : "—"}
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (typeof pitchAutoOffsetMs !== "number") return;
                    setPitchOffsetTouched(false);
                    setPitchOffsetMs(pitchAutoOffsetMs);
                  }}
                  disabled={typeof pitchAutoOffsetMs !== "number" || pitchRecording}
                >
                  Use auto
                </Button>
              </div>

              <RecordingControls
                isRecording={pitchRecording}
                elapsedMs={pitchRecordingElapsedMs}
                onStart={() => void startPitchRecording()}
                onStop={() => void stopPitchRecordingAndAnalyze()}
                disabled={!sovtCard}
                stopLabelPrefix="Stop + Analyze"
                hint="Load expected notes first for best results."
              />

              {pitchResults ? (
                <div className="rounded-md border p-3 space-y-2">
                  <div className="text-sm text-muted-foreground">
                    duration: <span className="font-mono">{formatMmSs(pitchResults.duration_ms)}</span> • contour points:{" "}
                    <span className="font-mono">{pitchResults.contour_points}</span> • in tune:{" "}
                    <span className="font-mono">{Math.round(pitchResults.ok_ratio * 100)}%</span>
                  </div>
                  <div className="grid gap-2">
                    {pitchResults.per_note.slice(0, 24).map((n) => (
                      <div key={n.idx} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
                        <div>
                          <b className="font-mono">#{n.idx}</b> <span className="font-mono">{n.note}</span>{" "}
                          <span className="text-xs text-muted-foreground">({n.expected_hz.toFixed(1)} Hz)</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          detected:{" "}
                          <span className="font-mono">{n.detected_hz ? `${n.detected_hz.toFixed(1)} Hz` : "(none)"}</span> • cents:{" "}
                          <span className="font-mono">{n.cents !== null ? n.cents.toFixed(0) : "—"}</span> •{" "}
                          <b className={n.ok ? "text-green-700" : "text-destructive"}>{n.ok ? "ok" : "off"}</b>
                        </div>
                      </div>
                    ))}
                  </div>
                  {pitchContour ? (
                    <PitchTimeline
                      durationMs={pitchResults.duration_ms}
                      notes={pitchResults.per_note}
                      contour={pitchContour}
                      okCents={PITCH_OK_CENTS}
                      clarityThreshold={PITCH_CLARITY_THRESHOLD}
                    />
                  ) : null}
                </div>
              ) : null}

              {Array.isArray(pitchHistory) && pitchHistory.length > 0 ? (
                <Accordion type="single" collapsible>
                  <AccordionItem value="pitch_history">
                    <AccordionTrigger>Pitch history (last {Math.min(10, pitchHistory.length)})</AccordionTrigger>
                    <AccordionContent>
                      <div className="grid gap-2 text-sm">
                        {pitchHistory.slice(0, 10).map((r: any) => (
                          <div key={String(r.id)} className="rounded-md border p-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="font-mono text-xs">{String(r.id)}</div>
                              <div className="text-xs text-muted-foreground">{String(r.created_at ?? "")}</div>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {r.step_title ? <b className="text-foreground">{String(r.step_title)}</b> : "pitch check"} • ok{" "}
                              {Math.round(Number(r.ok_ratio ?? 0) * 100)}% • {Number(r.ok_count ?? 0)}/{Number(r.note_count ?? 0)} notes • offset{" "}
                              {typeof r.offset_ms === "number" ? `${r.offset_ms}ms` : "—"}
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              ) : null}
            </div>
          </>
        ) : null}

        {sovtCard?.prompt ? (
          <Accordion type="single" collapsible>
            <AccordionItem value="prompt">
              <AccordionTrigger>Card prompt</AccordionTrigger>
              <AccordionContent>
                <ScrollArea className="h-[260px] rounded-md border">
                  <pre className="p-3 text-xs whitespace-pre-wrap">{String(sovtCard.prompt)}</pre>
                </ScrollArea>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ) : null}

        <Dialog open={pendingEndStatus !== null} onOpenChange={(open) => !open && setPendingEndStatus(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{pendingEndStatus === "completed" ? "Complete this session?" : "Abandon this session?"}</DialogTitle>
              <DialogDescription>
                {pendingEndStatus === "completed"
                  ? "This marks the current SOVT session as completed."
                  : "This ends the session and marks it as abandoned."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPendingEndStatus(null)}>
                Cancel
              </Button>
              <Button
                variant={pendingEndStatus === "completed" ? "secondary" : "destructive"}
                onClick={() => {
                  if (pendingEndStatus) completeSovt(pendingEndStatus);
                  setPendingEndStatus(null);
                }}
              >
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
