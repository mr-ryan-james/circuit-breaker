import React, { useMemo, useRef, useState } from "react";

import type { SovtCmdStep } from "@/app/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

import { callAction } from "@/api/client";

type NoteEvent = { idx: number; start_ms: number; duration_ms: number; midi: number; hz: number; note: string };
type NoteAnalysis = { duration_ms: number; note_events: NoteEvent[]; bpm?: number };

function formatMmSs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

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

// Minimal YIN-style pitch detector (offline). Good enough for an MVP pitch check.
function detectPitchContour(samples: Float32Array, sampleRate: number, opts?: { frameSize?: number; hopSize?: number; minHz?: number; maxHz?: number; threshold?: number }) {
  const frameSize = opts?.frameSize ?? 2048;
  const hopSize = opts?.hopSize ?? 512;
  const minHz = opts?.minHz ?? 80;
  const maxHz = opts?.maxHz ?? 1000;
  const threshold = opts?.threshold ?? 0.12;

  const tauMin = Math.max(2, Math.floor(sampleRate / maxHz));
  const tauMax = Math.min(frameSize - 2, Math.floor(sampleRate / minHz));

  const contour: Array<{ t_ms: number; hz: number | null; clarity: number }> = [];

  const diff = new Float32Array(tauMax + 1);
  const cmnd = new Float32Array(tauMax + 1);

  for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
    const frame = samples.subarray(start, start + frameSize);

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

    const tMs = Math.round((start / sampleRate) * 1000);
    contour.push({ t_ms: tMs, hz, clarity });
  }

  return contour;
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

export function SovtTab(props: {
  breakMenuLoaded: boolean;
  sovtCard: any | null;
  sovtError: string | null;
  sovtCompletion: any | null;
  sovtSteps: SovtCmdStep[];

  chooseBreakLaneAndStartSovt: () => void;
  runSovtCmd: (stepIdx: number) => Promise<void>;
  completeSovt: (status: "completed" | "abandoned") => void;
}) {
  const {
    breakMenuLoaded,
    sovtCard,
    sovtError,
    sovtCompletion,
    sovtSteps,
    chooseBreakLaneAndStartSovt,
    runSovtCmd,
    completeSovt,
  } = props;

  const [noteAnalysis, setNoteAnalysis] = useState<NoteAnalysis | null>(null);
  const [noteAnalysisStepIdx, setNoteAnalysisStepIdx] = useState<number | null>(null);
  const [pitchOffsetMs, setPitchOffsetMs] = useState<number>(0);
  const [pitchError, setPitchError] = useState<string | null>(null);

  const [pitchRecording, setPitchRecording] = useState(false);
  const [pitchRecordingStartedAtMs, setPitchRecordingStartedAtMs] = useState<number | null>(null);
  const [pitchRecordingElapsedMs, setPitchRecordingElapsedMs] = useState<number>(0);

  const [pitchResults, setPitchResults] = useState<
    | null
    | {
        duration_ms: number;
        contour_points: number;
        per_note: Array<{
          idx: number;
          note: string;
          expected_hz: number;
          detected_hz: number | null;
          cents: number | null;
          ok: boolean;
        }>;
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

  const canAnalyzeNotes = (step: SovtCmdStep): boolean => Array.isArray(step.args) && step.args[0] === "play";

  async function analyzeExpectedNotesForStep(step: SovtCmdStep): Promise<void> {
    setPitchError(null);
    setPitchResults(null);
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
      const decoded = await decodeRecordedAudio(blob);
      const contour = detectPitchContour(decoded.samples, decoded.sampleRate);

      const expected = noteAnalysis?.note_events ?? [];
      const shiftedExpected = expected.map((ev) => ({
        ...ev,
        start_ms: ev.start_ms + pitchOffsetMs,
      }));

      const perNote = shiftedExpected.map((ev) => {
        const start = ev.start_ms;
        const end = ev.start_ms + ev.duration_ms;
        const values = contour
          .filter((p) => p.hz !== null && p.clarity >= 0.55 && p.t_ms >= start && p.t_ms <= end)
          .map((p) => p.hz as number);
        const det = median(values);
        const cents = det ? centsDiff(det, ev.hz) : null;
        const ok = cents !== null ? Math.abs(cents) <= 60 : false;
        return { idx: ev.idx, note: ev.note, expected_hz: ev.hz, detected_hz: det, cents, ok };
      });

      const okCount = perNote.filter((p) => p.ok).length;
      const okRatio = perNote.length > 0 ? okCount / perNote.length : 0;

      setPitchResults({
        duration_ms: Math.round((decoded.samples.length / decoded.sampleRate) * 1000),
        contour_points: contour.length,
        per_note: perNote,
        ok_ratio: okRatio,
      });
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>SOVT / Pitch</CardTitle>
        <CardDescription>Run SOVT card scripts in the browser (server plays audio locally via `site-toggle play`).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={chooseBreakLaneAndStartSovt} disabled={!breakMenuLoaded}>
            Load from Break menu (choose + start)
          </Button>
          <Button variant="outline" onClick={() => completeSovt("completed")} disabled={!breakMenuLoaded || !sovtCard?.id}>
            Mark completed
          </Button>
          <Button variant="outline" onClick={() => completeSovt("abandoned")} disabled={!breakMenuLoaded || !sovtCard?.id}>
            Mark abandoned
          </Button>
          <div className="text-sm text-muted-foreground">
            card: <span className="font-mono">{sovtCard?.id ?? "(none)"}</span>
          </div>
        </div>

        {sovtError ? (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{sovtError}</AlertDescription>
          </Alert>
        ) : null}

        {sovtCompletion ? (
          <Alert>
            <AlertTitle>Completion logged</AlertTitle>
            <AlertDescription>
              <pre className="mt-2 whitespace-pre-wrap rounded-md bg-muted/30 p-2 text-xs">{JSON.stringify(sovtCompletion, null, 2)}</pre>
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
          <div className="text-sm text-muted-foreground">Choose the `sovt` lane in the Break tab (or click “Choose + Start SOVT” there).</div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => {
              const next = sovtSteps.find((s) => s.status === "pending" || s.status === "error") ?? null;
              if (next) void runSovtCmd(next.idx);
            }}
            disabled={sovtSteps.some((s) => s.status === "running") || sovtSteps.length === 0}
          >
            Run next CMD
          </Button>
          {sovtSteps.some((s) => s.status === "running") ? (
            <span className="text-sm text-muted-foreground">
              <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" /> Running…
            </span>
          ) : null}
        </div>

        {sovtSteps.length === 0 ? (
          <div className="text-sm text-muted-foreground">No CMD steps parsed yet.</div>
        ) : (
          <div className="grid gap-2">
            {sovtSteps.map((s) => (
              <div key={s.idx} className="rounded-md border p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">
                      {s.idx}. {s.title}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono break-all">{s.raw_cmd}</div>
                    <div className="text-xs text-muted-foreground">
                      status: <b>{s.status}</b>
                      {s.started_at_ms ? ` • started ${formatMmSs(Date.now() - s.started_at_ms)} ago` : ""}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void runSovtCmd(s.idx)} disabled={s.status === "running" || sovtSteps.some((x) => x.status === "running")}>
                      Run
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void analyzeExpectedNotesForStep(s)} disabled={!canAnalyzeNotes(s) || s.status === "running"}>
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
            ))}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pitch Check (MVP)</CardTitle>
            <CardDescription>
              Record your mic and compare to expected notes from a `site-toggle play` command. Use headphones to avoid capturing the piano audio.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
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
                    "Click “Notes” on a CMD step to load targets."
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
                  onChange={(e) => setPitchOffsetMs(Number(e.target.value))}
                  className="w-[140px]"
                />
              </div>
              {!pitchRecording ? (
                <Button onClick={() => void startPitchRecording()} disabled={pitchRecording}>
                  Record
                </Button>
              ) : (
                <Button onClick={() => void stopPitchRecordingAndAnalyze()}>
                  Stop + Analyze ({formatMmSs(pitchRecordingElapsedMs)})
                </Button>
              )}
              {pitchRecording ? (
                <span className="text-sm text-muted-foreground">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" /> Recording {formatMmSs(pitchRecordingElapsedMs)}
                </span>
              ) : null}
            </div>

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
                        <span className="font-mono">{n.detected_hz ? `${n.detected_hz.toFixed(1)} Hz` : "(none)"}</span>{" "}
                        • cents: <span className="font-mono">{n.cents !== null ? n.cents.toFixed(0) : "—"}</span> •{" "}
                        <b className={n.ok ? "text-green-700" : "text-destructive"}>{n.ok ? "ok" : "off"}</b>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {sovtCard?.prompt ? (
          <Accordion type="single" collapsible>
            <AccordionItem value="prompt">
              <AccordionTrigger>Card prompt (debug)</AccordionTrigger>
              <AccordionContent>
                <ScrollArea className="h-[260px] rounded-md border">
                  <pre className="p-3 text-xs whitespace-pre-wrap">{String(sovtCard.prompt)}</pre>
                </ScrollArea>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ) : null}
      </CardContent>
    </Card>
  );
}
