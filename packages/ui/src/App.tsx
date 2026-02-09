import React, { useEffect, useMemo, useRef, useState } from "react";
import { callAction, fetchStatus, getToken, type ApiStatus } from "./api/client";
import { connectWs, type WsMessage } from "./ws/client";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type ScriptRow = { id: number; title: string; source_format: string; created_at: string };
type CharacterRow = { normalized_name: string; name: string; voice: string; rate: string };
type LineRow = { idx: number; type: string; speaker_normalized: string | null; text: string; scene_number: number | null; scene_heading: string | null };

type Signal = { id: string; name: string; payload: unknown; created_at: string };

type TimelineItem = {
  key: string;
  kind: "direction" | "line" | "gap" | "pause";
  idx: number;
  speaker: string | null;
  text: string | null;
  revealed: boolean;
  cue: string | null;
};

type BreakMenuLane =
  | { type: "same_need"; prompt: string }
  | { type: "feed"; site: string; minutes: number; command: string }
  | { type: string; card?: any; recent_scripts?: any[] };

type BreakMenu = {
  event_key: string;
  site: string;
  lanes: BreakMenuLane[];
};

type SpanishBrain = {
  v: 1;
  assistant_text: string;
  tool_requests: Array<any>;
  await: "user" | "listen_result" | "done";
};

type SpanishSpeakResult = { id: string; tool: "speak"; audio_id: string; url: string; duration_sec: number };
type SpanishPendingListen = { id: string; tool: "listen"; target_text: string };

type SpanishSessionRow = {
  id: string;
  created_at: string;
  updated_at: string;
  status: "open" | "completed" | "abandoned";
  source: string;
  event_key: string | null;
  lane: string | null;
  card_id: number | null;
  card_key: string | null;
  card_prompt: string | null;
  codex_thread_id: string | null;
  brain_name: string | null;
  brain_thread_id: string | null;
  pending_tool_json: string | null;
};

type SpanishTurnRow = {
  id: string;
  session_id: string;
  idx: number;
  role: string;
  kind: string;
  content: string | null;
  json: string | null;
  created_at: string;
};

type SpanishMessage = {
  role: "tutor" | "you" | "system";
  text: string;
  timestamp: number;
  speakResults?: SpanishSpeakResult[];
};

type BrainDefault = "codex" | "claude";

type SovtCmdStep = {
  idx: number;
  title: string;
  raw_cmd: string;
  args: string[];
  status: "pending" | "running" | "done" | "error";
  started_at_ms: number | null;
  ended_at_ms: number | null;
  result_json: string | null;
  error: string | null;
};

export function App() {
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [scripts, setScripts] = useState<ScriptRow[]>([]);
  const [selectedScriptId, setSelectedScriptId] = useState<number | null>(null);
  const [characters, setCharacters] = useState<CharacterRow[]>([]);
  const [lines, setLines] = useState<LineRow[]>([]);

  const [signals, setSignals] = useState<Signal[]>([]);
  const [wsState, setWsState] = useState<"connecting" | "open" | "closed">("connecting");

  const [activeTab, setActiveTab] = useState<"break" | "acting" | "spanish" | "sovt" | "signals" | "status">("break");

  const [me, setMe] = useState("Melchior");
  const [mode, setMode] = useState<"practice" | "learn" | "read_through" | "speed_through">("practice");
  const [readAll, setReadAll] = useState(false);
  const [fromIdx, setFromIdx] = useState(1);
  const [toIdx, setToIdx] = useState(200);
  const [pauseMult, setPauseMult] = useState(1.0);
  const [cueWords, setCueWords] = useState(0);
  const [speedMult, setSpeedMult] = useState(1.0);
  const [seekIdx, setSeekIdx] = useState<number>(1);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionPlaying, setSessionPlaying] = useState(false);
  const [currentIdx, setCurrentIdx] = useState<number | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [audioNeedsGesture, setAudioNeedsGesture] = useState(false);

  const [breakSite, setBreakSite] = useState("reddit");
  const [breakMinutes, setBreakMinutes] = useState<number>(10);
  const [breakContext, setBreakContext] = useState<string>("home");
  const [breakMenu, setBreakMenu] = useState<BreakMenu | null>(null);
  const [breakChoice, setBreakChoice] = useState<any | null>(null);
  const [autoStartActing, setAutoStartActing] = useState(true);
  const [actingPickerScripts, setActingPickerScripts] = useState<any[] | null>(null);
  const [actingPickerOpen, setActingPickerOpen] = useState(false);
  const [actingPickerLoadingId, setActingPickerLoadingId] = useState<number | null>(null);

  const [spanishSessionId, setSpanishSessionId] = useState<string | null>(null);
  const [spanishBrain, setSpanishBrain] = useState<SpanishBrain | null>(null);
  const [spanishAnswer, setSpanishAnswer] = useState("");
  const [spanishSpeakResults, setSpanishSpeakResults] = useState<SpanishSpeakResult[]>([]);
  const [spanishPendingListen, setSpanishPendingListen] = useState<SpanishPendingListen | null>(null);
  const [spanishError, setSpanishError] = useState<string | null>(null);
  const [spanishRecording, setSpanishRecording] = useState(false);
  const [spanishRecordingStartedAtMs, setSpanishRecordingStartedAtMs] = useState<number | null>(null);
  const [spanishRecordingElapsedMs, setSpanishRecordingElapsedMs] = useState<number>(0);
  const [spanishSessions, setSpanishSessions] = useState<SpanishSessionRow[]>([]);
  const [spanishTranscriptSessionId, setSpanishTranscriptSessionId] = useState<string | null>(null);
  const [spanishTranscriptTurns, setSpanishTranscriptTurns] = useState<SpanishTurnRow[]>([]);
  const [spanishTranscriptError, setSpanishTranscriptError] = useState<string | null>(null);

  // Brain default, chat history, loading, audio queue
  const [spanishBrainDefault, setSpanishBrainDefault] = useState<BrainDefault>("codex");
  const [spanishMessages, setSpanishMessages] = useState<SpanishMessage[]>([]);
  const [spanishLoading, setSpanishLoading] = useState(false);
  const [spanishAudioQueue, setSpanishAudioQueue] = useState<string[]>([]);
  const [spanishAudioMuted, setSpanishAudioMuted] = useState(false);
  const [spanishAudioNeedsGesture, setSpanishAudioNeedsGesture] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const spanishAudioRef = useRef<HTMLAudioElement | null>(null);
  const actingTimelineEndRef = useRef<HTMLDivElement | null>(null);
  const pendingEventIdRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const autoPlayOnNextStartRef = useRef(false);
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const timelineTailLimit = 2000;

  const spanishChatEndRef = useRef<HTMLDivElement | null>(null);
  const spanishRequestIdRef = useRef(0);

  const [sovtCard, setSovtCard] = useState<any | null>(null);
  const [sovtEventKey, setSovtEventKey] = useState<string | null>(null);
  const [sovtSteps, setSovtSteps] = useState<SovtCmdStep[]>([]);
  const [sovtError, setSovtError] = useState<string | null>(null);
  const [sovtCompletion, setSovtCompletion] = useState<any | null>(null);

  const spanishRecorderRef = useRef<{
    stream: MediaStream;
    audioCtx: AudioContext;
    source: MediaStreamAudioSourceNode;
    proc: ScriptProcessorNode;
    chunks: Float32Array[];
    sampleRate: number;
  } | null>(null);

  function normalizeName(raw: string): string {
    return raw
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function flattenFloat32(chunks: Float32Array[]): Float32Array {
    const len = chunks.reduce((a, c) => a + c.length, 0);
    const out = new Float32Array(len);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }

  function downsampleFloat32(input: Float32Array, inRate: number, outRate: number): Float32Array {
    if (outRate === inRate) return input;
    const ratio = inRate / outRate;
    const outLen = Math.floor(input.length / ratio);
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i += 1) {
      const start = Math.floor(i * ratio);
      const end = Math.floor((i + 1) * ratio);
      let sum = 0;
      let count = 0;
      for (let j = start; j < end && j < input.length; j += 1) {
        sum += input[j] ?? 0;
        count += 1;
      }
      out[i] = count ? sum / count : 0;
    }
    return out;
  }

  function encodeWavPcm16(samples: Float32Array, sampleRate: number): Blob {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeStr = (off: number, s: string) => {
      for (let i = 0; i < s.length; i += 1) view.setUint8(off + i, s.charCodeAt(i));
    };

    writeStr(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, samples.length * 2, true);

    let o = 44;
    for (let i = 0; i < samples.length; i += 1) {
      const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
      view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }

    return new Blob([buffer], { type: "audio/wav" });
  }

  async function startSpanishRecording() {
    setSpanishError(null);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);

    // ScriptProcessor is deprecated but reliable for an MVP; swap to AudioWorklet later if needed.
    const proc = audioCtx.createScriptProcessor(4096, 1, 1);
    const chunks: Float32Array[] = [];
    proc.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(input));
    };

    source.connect(proc);
    proc.connect(audioCtx.destination);
    spanishRecorderRef.current = { stream, audioCtx, source, proc, chunks, sampleRate: audioCtx.sampleRate };
    setSpanishRecording(true);
    setSpanishRecordingStartedAtMs(Date.now());
    setSpanishRecordingElapsedMs(0);
  }

  async function stopSpanishRecordingToWav16k(): Promise<Blob | null> {
    const r = spanishRecorderRef.current;
    if (!r) return null;

    try {
      r.proc.disconnect();
      r.source.disconnect();
      r.stream.getTracks().forEach((t) => t.stop());
      await r.audioCtx.close();
    } finally {
      spanishRecorderRef.current = null;
      setSpanishRecording(false);
      setSpanishRecordingStartedAtMs(null);
      setSpanishRecordingElapsedMs(0);
    }

    const flat = flattenFloat32(r.chunks);
    const down = downsampleFloat32(flat, r.sampleRate, 16000);
    return encodeWavPcm16(down, 16000);
  }

  useEffect(() => {
    if (!spanishRecording || !spanishRecordingStartedAtMs) return;
    const id = window.setInterval(() => {
      setSpanishRecordingElapsedMs(Math.max(0, Date.now() - spanishRecordingStartedAtMs));
    }, 200);
    return () => window.clearInterval(id);
  }, [spanishRecording, spanishRecordingStartedAtMs]);

  useEffect(() => {
    fetchStatus()
      .then((s) => setStatus(s))
      .then(async () => {
        const [scripts, brain] = await Promise.all([
          callAction<{ ok: boolean; scripts: ScriptRow[] }>("acting.scripts.list", { limit: 10 }),
          callAction<{ ok: boolean; brain: string }>("spanish.brain.get", {}),
        ]);
        if (scripts.ok) setScripts(scripts.scripts);
        if (brain.ok && (brain.brain === "codex" || brain.brain === "claude")) {
          setSpanishBrainDefault(brain.brain);
        }
      })
      .catch(() => setStatus({ ok: false }));
  }, []);

  useEffect(() => {
    let disposed = false;

    const onMessage = (m: WsMessage) => {
      if (m.type === "agent.signals.snapshot") {
        setSignals(m.signals as Signal[]);
        return;
      }
      if (m.type === "agent.signal") {
        setSignals((prev) => [...prev, m as Signal].slice(-200));
        return;
      }

      if (m.type === "run_lines.session" && m.event === "started") {
        setSessionId(m.session_id);
        const shouldAutoPlay = autoPlayOnNextStartRef.current;
        autoPlayOnNextStartRef.current = false;
        setSessionPlaying(shouldAutoPlay);
        setCurrentIdx(null);
        setTimeline([]);
        seenEventIdsRef.current = new Set();
        setAudioNeedsGesture(false);
        if (shouldAutoPlay) {
          wsRef.current?.send(JSON.stringify({ type: "run_lines.play", session_id: m.session_id }));
        }
        return;
      }

      if (m.type === "run_lines.session" && m.event === "ended") {
        setSessionId(null);
        setSessionPlaying(false);
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = null;
        seenEventIdsRef.current = new Set();
        setAudioNeedsGesture(false);
        return;
      }

      if (m.type === "run_lines.session" && m.event === "seeked") {
        setCurrentIdx(null);
        setTimeline([]);
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = null;
        seenEventIdsRef.current = new Set();
        setAudioNeedsGesture(false);
        return;
      }

      if (m.type === "run_lines.session" && m.event === "jumped") {
        const target = typeof m.target_idx === "number" ? m.target_idx : null;
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = null;
        pendingEventIdRef.current = null;
        setAudioNeedsGesture(false);

        if (target !== null) {
          setCurrentIdx(target);
          // Hide anything after the jump target so practice stays “non-spoilery”.
          setTimeline((prev) => prev.filter((t) => t.idx <= target));
        }
        return;
      }

      if (m.type === "run_lines.session" && m.event === "speed") {
        if (typeof m.speed_mult === "number") setSpeedMult(m.speed_mult);
        return;
      }

      if (m.type === "run_lines.event") {
        // Defensive: ignore duplicate WS events (can happen due to retries/reconnects or accidental replays).
        const eventId = String(m.event_id ?? "");
        if (eventId) {
          const seen = seenEventIdsRef.current;
          if (seen.has(eventId)) return;
          seen.add(eventId);
        }

        pendingEventIdRef.current = m.event_id;
        setCurrentIdx(m.idx);
        const push = (item: TimelineItem) => {
          setTimeline((prev) => {
            // Maintain one row per script idx. This prevents duplicate rows when we jump back and replay.
            const withoutSameIdx = prev.filter((t) => t.idx !== item.idx);
            const next = [...withoutSameIdx, item];
            return next.length > timelineTailLimit ? next.slice(next.length - timelineTailLimit) : next;
          });
        };

        if (m.kind === "direction") {
          push({
            key: `${m.session_id}-${m.event_id}`,
            kind: "direction",
            idx: m.idx,
            speaker: null,
            text: String(m.text ?? ""),
            revealed: true,
            cue: null,
          });
          // directions are instant; auto-ack
          wsRef.current?.send(
            JSON.stringify({ type: "run_lines.ack", session_id: m.session_id, event_id: m.event_id, status: "done" }),
          );
          return;
        }

        if (m.kind === "gap") {
          push({
            key: `${m.session_id}-${m.event_id}`,
            kind: "gap",
            idx: m.idx,
            speaker: m.speaker ?? null,
            text: String(m.text ?? ""),
            revealed: false,
            cue: null,
          });
          const ms = Math.max(0, Math.round((m.duration_sec ?? 0) * 1000));
          if (timerRef.current !== null) window.clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(() => {
            setTimeline((prev) =>
              prev.map((t) => (t.key === `${m.session_id}-${m.event_id}` ? { ...t, revealed: true } : t)),
            );
            wsRef.current?.send(
              JSON.stringify({ type: "run_lines.ack", session_id: m.session_id, event_id: m.event_id, status: "done" }),
            );
          }, ms);
          return;
        }

        if (m.kind === "pause") {
          // Replace any existing row for this idx (including a previously revealed line)
          // so your line becomes "(your turn)" during the countdown.
          push({
            key: `${m.session_id}-${m.event_id}`,
            kind: "pause",
            idx: m.idx,
            speaker: me,
            text: null,
            revealed: false,
            cue: m.cue ?? null,
          });
          const ms = Math.max(0, Math.round((m.duration_sec ?? 0) * 1000));
          if (timerRef.current !== null) window.clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(() => {
            wsRef.current?.send(
              JSON.stringify({ type: "run_lines.ack", session_id: m.session_id, event_id: m.event_id, status: "done" }),
            );
          }, ms);
          return;
        }

        if (m.kind === "line" && m.audio?.url) {
          // Always render the line once we get the "line" event.
          //
          // In practice mode, the server sends a "pause" event first for your lines; that shows "(your turn)".
          // After the countdown, the server sends this "line" event (with audio). We replace the pause row
          // so you can see what the line actually was after attempting it.
          push({
            key: `${m.session_id}-${m.event_id}`,
            kind: "line",
            idx: m.idx,
            speaker: m.speaker ?? null,
            text: String(m.text ?? ""),
            revealed: true,
            cue: null,
          });
          const audio = audioRef.current;
          if (!audio) return;
          audio.src = m.audio.url;
          audio.playbackRate = typeof m.playback_rate === "number" ? m.playback_rate : 1.0;
          audio.onended = () => {
            wsRef.current?.send(
              JSON.stringify({ type: "run_lines.ack", session_id: m.session_id, event_id: m.event_id, status: "done" }),
            );
          };
          audio.onerror = () => {
            // If audio fails to load/decode, don't deadlock the server's ack loop.
            wsRef.current?.send(
              JSON.stringify({ type: "run_lines.ack", session_id: m.session_id, event_id: m.event_id, status: "done" }),
            );
          };
          audio
            .play()
            .then(() => setAudioNeedsGesture(false))
            .catch(() => {
              setAudioNeedsGesture(true);
            });
          return;
        }
      }
    };

    async function connect(): Promise<void> {
      if (disposed) return;
      try {
        if (!getToken()) await fetchStatus();
        const token = getToken();
        if (!token) throw new Error("Missing token");

        const ws = connectWs(onMessage, token);
        wsRef.current = ws;
        ws.onopen = () => setWsState("open");
        ws.onclose = () => {
          setWsState("closed");
          if (disposed) return;
          // Server token rotates on restart; refresh and reconnect.
          window.setTimeout(() => {
            if (disposed) return;
            fetchStatus().finally(() => connect().catch(() => {}));
          }, 750);
        };
      } catch {
        setWsState("closed");
      }
    }

    connect().catch(() => {});
    return () => {
      disposed = true;
      wsRef.current?.close();
    };
  }, []);

  // Auto-scroll Spanish chat to bottom on new messages.
  useEffect(() => {
    spanishChatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [spanishMessages]);

  // Auto-play Spanish audio queue.
  useEffect(() => {
    if (spanishAudioMuted || spanishAudioQueue.length === 0) return;
    const audio = spanishAudioRef.current;
    if (!audio) return;

    const url = spanishAudioQueue[0]!;
    // Skip if already playing this URL.
    if (audio.src && audio.src.endsWith(url) && !audio.paused) return;

    audio.src = url;
    audio.onended = () => {
      setSpanishAudioQueue((q) => q.slice(1));
    };
    audio.play()
      .then(() => setSpanishAudioNeedsGesture(false))
      .catch(() => setSpanishAudioNeedsGesture(true));
  }, [spanishAudioQueue, spanishAudioMuted]);

  async function loadScript(id: number): Promise<{ from: number; to: number } | null> {
    setSelectedScriptId(id);
    const chars = await callAction<{ ok: boolean; characters: CharacterRow[] }>("acting.script.characters", { script_id: id });
    if (chars.ok) setCharacters(chars.characters);
    const l = await callAction<{ ok: boolean; lines: LineRow[] }>("acting.script.lines", { script_id: id, from: 0, to: 2000 });
    if (l.ok) setLines(l.lines);
    if (l.ok && l.lines.length > 0) {
      const from = l.lines[0]!.idx;
      const to = l.lines[l.lines.length - 1]!.idx;
      setFromIdx(from);
      setToIdx(to);
      setSeekIdx(from);
      return { from, to };
    }
    return null;
  }

  function startSessionWith(scriptId: number, from: number, to: number, opts: { autoPlay?: boolean } = {}) {
    if (!wsRef.current || wsState !== "open") return;
    setTimeline([]);
    setSessionPlaying(false);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    autoPlayOnNextStartRef.current = Boolean(opts.autoPlay);

    const rawMode = mode;
    const revealAfter = rawMode === "learn";
    wsRef.current.send(
      JSON.stringify({
        type: "run_lines.start",
        script_id: scriptId,
        from,
        to,
        mode: rawMode,
        me,
        read_all: mode === "read_through" ? true : readAll,
        pause_mult: pauseMult,
        cue_words: cueWords,
        reveal_after: revealAfter,
        speed_mult: mode === "speed_through" ? 1.3 : speedMult,
      }),
    );
  }

  function startSession() {
    if (!selectedScriptId) return;
    startSessionWith(selectedScriptId, fromIdx, toIdx, { autoPlay: true });
  }

  function playSession() {
    if (!sessionId) return;
    if (!wsRef.current || wsState !== "open") return;
    setSessionPlaying(true);
    wsRef.current.send(JSON.stringify({ type: "run_lines.play", session_id: sessionId }));
  }

  async function loadBreakMenu() {
    setBreakChoice(null);
    setActingPickerScripts(null);
    setActingPickerOpen(false);
    const res = await callAction<{ ok: boolean; menu: BreakMenu }>("break.menu", {
      site_slug: breakSite,
      minutes: breakMinutes,
      context: breakContext || undefined,
    });
    if (res.ok) setBreakMenu(res.menu);
    else setBreakMenu(null);
  }

  async function loadAndMaybeStart(scriptId: number, start: boolean): Promise<void> {
    const range = await loadScript(scriptId);
    if (!range) return;
    if (start) startSessionWith(scriptId, range.from, range.to, { autoPlay: true });
  }

  async function unblockAllFromUi(minutes: number) {
    const ok = window.confirm(`Unblock ALL sites for ${minutes} minutes?\n\nThis edits /etc/hosts and requires passwordless sudo.`);
    if (!ok) return;
    const res = await callAction<any>("hosts.unblock_all", { minutes });
    setBreakChoice(res);
  }

  async function chooseBreakLane(lane: string): Promise<any | null> {
    if (!breakMenu) return null;
    const res = await callAction<any>("break.choose", { event_key: breakMenu.event_key, lane });
    setBreakChoice(res);

    // One-click flow: choosing the acting lane can auto-load + auto-start the most recent scene.
    if (lane === "acting" && autoStartActing && res?.ok) {
      const actingLane: any = (breakMenu.lanes as any[]).find((l) => l.type === "acting") ?? null;
      const recent = Array.isArray(actingLane?.recent_scripts) ? actingLane.recent_scripts : [];
      if (recent.length === 0) return res;

      // Only auto-start when the choice is unambiguous.
      if (recent.length === 1) {
        const scriptId = Number(recent[0]?.id ?? 0);
        if (!Number.isFinite(scriptId) || scriptId <= 0) return res;
        await loadAndMaybeStart(scriptId, true);
        setActiveTab("acting");
        return res;
      }

      // Multiple recents: prompt user to pick which one to start.
      setActingPickerScripts(recent.slice(0, 5));
      setActingPickerOpen(true);
    }

    return res;
  }

  async function startSpanishSession(eventKey: string, lane: string, card: any): Promise<void> {
    setSpanishError(null);
    if (!["verb", "noun", "lesson", "fusion"].includes(lane)) {
      setSpanishError(`Not a Spanish lane: ${lane}`);
      return;
    }
    if (!card?.prompt) {
      setSpanishError("Missing card prompt.");
      return;
    }

    const reqId = ++spanishRequestIdRef.current;
    setSpanishLoading(true);
    setSpanishMessages([{ role: "system", text: `Session starting (${spanishBrainDefault})...`, timestamp: Date.now() }]);
    setSpanishSpeakResults([]);
    setSpanishPendingListen(null);
    setSpanishAudioQueue([]);
    setSpanishAudioNeedsGesture(false);

    try {
      const res = await callAction<any>("spanish.session.start", {
        event_key: eventKey,
        lane,
        card_id: card?.id ?? undefined,
        card_key: card?.key ?? undefined,
        card_prompt: String(card.prompt),
      });

      if (spanishRequestIdRef.current !== reqId) return; // stale

      if (!res?.ok) {
        setSpanishError(String(res?.error ?? "Failed to start Spanish session"));
        return;
      }

      setSpanishSessionId(String(res.session_id));
      setSpanishBrain(res.brain ?? null);
      const speaks = Array.isArray(res.speak_results) ? (res.speak_results as SpanishSpeakResult[]) : [];
      setSpanishSpeakResults(speaks);
      setSpanishPendingListen(res.pending_listen ?? null);

      // Chat + audio
      if (res.brain?.assistant_text) {
        setSpanishMessages((prev) => [
          ...prev,
          { role: "tutor", text: res.brain.assistant_text, timestamp: Date.now(), speakResults: speaks },
        ]);
      }
      queueSpanishAudio(speaks);

      if (res.session_status === "completed" || res.brain?.await === "done") {
        setSpanishMessages((prev) => [...prev, { role: "system", text: "Session completed.", timestamp: Date.now() }]);
        resetSpanishSessionLocal();
      }
    } finally {
      if (spanishRequestIdRef.current === reqId) setSpanishLoading(false);
    }
  }

  async function chooseBreakLaneAndStartSpanish(lane: "verb" | "noun" | "lesson" | "fusion") {
    setSpanishError(null);
    if (!breakMenu) {
      setSpanishError("Load a break menu first.");
      return;
    }
    const choice = await chooseBreakLane(lane);
    if (!choice?.ok || !choice?.card?.prompt) {
      setSpanishError(String(choice?.error ?? "Failed to choose lane"));
      return;
    }
    await startSpanishSession(breakMenu.event_key, lane, choice.card);
    setActiveTab("spanish");
  }

  async function startSpanishSessionFromChoice() {
    setSpanishError(null);
    if (!breakMenu) {
      setSpanishError("Load a break menu first.");
      return;
    }
    if (!breakChoice?.ok || !breakChoice?.card?.prompt) {
      setSpanishError("Choose a Spanish lane (verb/noun/lesson/fusion) first.");
      return;
    }
    const lane = String(breakChoice?.lane ?? "");
    if (!["verb", "noun", "lesson", "fusion"].includes(lane)) {
      setSpanishError(`Not a Spanish lane: ${lane}`);
      return;
    }
    await startSpanishSession(breakMenu.event_key, lane, breakChoice.card);
  }

  function loadSovtFromCard(eventKey: string | null, card: any) {
    setSovtError(null);
    setSovtCompletion(null);
    setSovtCard(card ?? null);
    setSovtEventKey(eventKey);
    const prompt = String(card?.prompt ?? "");
    setSovtSteps(parseSovtCmdSteps(prompt));
  }

  async function chooseBreakLaneAndStartSovt() {
    setSovtError(null);
    setSovtCompletion(null);
    if (!breakMenu) {
      setSovtError("Load a break menu first.");
      return;
    }
    const choice = await chooseBreakLane("sovt");
    if (!choice?.ok || !choice?.card?.prompt) {
      setSovtError(String(choice?.error ?? "Failed to choose sovt lane"));
      return;
    }
    loadSovtFromCard(breakMenu.event_key, choice.card);
    setActiveTab("sovt");
  }

  async function runSovtCmd(stepIdx: number) {
    const step = sovtSteps.find((s) => s.idx === stepIdx) ?? null;
    if (!step) return;
    setSovtError(null);

    setSovtSteps((prev) =>
      prev.map((s) =>
        s.idx === stepIdx
          ? { ...s, status: "running", started_at_ms: Date.now(), ended_at_ms: null, error: null }
          : s,
      ),
    );

    try {
      const res = await callAction<any>("sovt.play", { args: step.args });
      if (!res?.ok) {
        const msg = String(res?.error ?? "play_failed");
        setSovtSteps((prev) =>
          prev.map((s) =>
            s.idx === stepIdx
              ? { ...s, status: "error", ended_at_ms: Date.now(), error: msg, result_json: prettyJson(JSON.stringify(res)) }
              : s,
          ),
        );
        setSovtError(msg);
        return;
      }

      setSovtSteps((prev) =>
        prev.map((s) =>
          s.idx === stepIdx
            ? { ...s, status: "done", ended_at_ms: Date.now(), result_json: JSON.stringify(res, null, 2), error: null }
            : s,
        ),
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setSovtSteps((prev) =>
        prev.map((s) => (s.idx === stepIdx ? { ...s, status: "error", ended_at_ms: Date.now(), error: msg } : s)),
      );
      setSovtError(msg);
    }
  }

  async function completeSovt(status: "completed" | "partial" | "abandoned") {
    setSovtError(null);
    if (!sovtEventKey) return setSovtError("Missing event_key (load SOVT from Break menu first).");
    if (!sovtCard?.id) {
      setSovtError("Choose the SOVT lane first.");
      return;
    }
    const res = await callAction<any>("sovt.complete", { event_key: sovtEventKey, card_id: Number(sovtCard.id), status });
    if (!res?.ok) {
      setSovtError(String(res?.error ?? "Failed to complete module"));
      return;
    }
    setSovtCompletion(res);
  }

  async function submitSpanishAnswer() {
    setSpanishError(null);
    if (!spanishSessionId) return;
    const answer = spanishAnswer.trim();
    if (!answer) return;

    const reqId = ++spanishRequestIdRef.current;
    setSpanishLoading(true);
    setSpanishMessages((prev) => [...prev, { role: "you", text: answer, timestamp: Date.now() }]);
    setSpanishAnswer("");

    try {
      const res = await callAction<any>("spanish.session.answer", { session_id: spanishSessionId, answer });

      if (spanishRequestIdRef.current !== reqId) return; // stale

      if (!res?.ok) {
        setSpanishError(String(res?.error ?? "Failed to submit answer"));
        return;
      }

      setSpanishBrain(res.brain ?? null);
      const speaks = Array.isArray(res.speak_results) ? (res.speak_results as SpanishSpeakResult[]) : [];
      setSpanishSpeakResults(speaks);
      setSpanishPendingListen(res.pending_listen ?? null);

      if (res.brain?.assistant_text) {
        setSpanishMessages((prev) => [
          ...prev,
          { role: "tutor", text: res.brain.assistant_text, timestamp: Date.now(), speakResults: speaks },
        ]);
      }
      queueSpanishAudio(speaks);

      if (res.session_status === "completed" || res.brain?.await === "done") {
        setSpanishMessages((prev) => [...prev, { role: "system", text: "Session completed.", timestamp: Date.now() }]);
        resetSpanishSessionLocal();
      }
    } finally {
      if (spanishRequestIdRef.current === reqId) setSpanishLoading(false);
    }
  }

  function resetSpanishSessionLocal() {
    setSpanishSessionId(null);
    setSpanishBrain(null);
    setSpanishSpeakResults([]);
    setSpanishPendingListen(null);
    setSpanishAnswer("");
    setSpanishLoading(false);
    setSpanishAudioQueue([]);
    setSpanishAudioNeedsGesture(false);
  }

  async function endSpanishSession(status: "completed" | "abandoned") {
    setSpanishError(null);
    if (!spanishSessionId) return;
    ++spanishRequestIdRef.current; // invalidate any in-flight requests
    await callAction<any>("spanish.session.end", { session_id: spanishSessionId, status });
    resetSpanishSessionLocal();
  }

  async function uploadSpanishListenAttempt() {
    setSpanishError(null);
    if (!spanishSessionId) return;
    const wav = await stopSpanishRecordingToWav16k();
    if (!wav) return;

    const t = getToken();
    if (!t) {
      setSpanishError("Missing server token. Refresh the page.");
      return;
    }

    const reqId = ++spanishRequestIdRef.current;
    setSpanishLoading(true);

    try {
      const fd = new FormData();
      fd.append("session_id", spanishSessionId);
      fd.append("attempt_wav", wav, "attempt.wav");
      const resp = await fetch("/api/spanish/listen/upload", { method: "POST", headers: { "x-cb-token": t }, body: fd });
      const data = await resp.json().catch(() => null);

      if (spanishRequestIdRef.current !== reqId) return; // stale

      if (!data?.ok) {
        setSpanishError(String(data?.error ?? "listen upload failed"));
        return;
      }
      setSpanishBrain(data.brain ?? null);
      const speaks = Array.isArray(data.speak_results) ? (data.speak_results as SpanishSpeakResult[]) : [];
      setSpanishSpeakResults(speaks);
      setSpanishPendingListen(data.pending_listen ?? null);

      if (data.brain?.assistant_text) {
        setSpanishMessages((prev) => [
          ...prev,
          { role: "tutor", text: data.brain.assistant_text, timestamp: Date.now(), speakResults: speaks },
        ]);
      }
      queueSpanishAudio(speaks);

      if (data.session_status === "completed" || data.brain?.await === "done") {
        setSpanishMessages((prev) => [...prev, { role: "system", text: "Session completed.", timestamp: Date.now() }]);
        resetSpanishSessionLocal();
      }
    } finally {
      if (spanishRequestIdRef.current === reqId) setSpanishLoading(false);
    }
  }

  async function playSpanishAudio(url: string) {
    const a = spanishAudioRef.current;
    if (!a) return;
    a.src = url;
    try {
      await a.play();
    } catch {
      // Autoplay restrictions: user may need to click play in the controls.
    }
  }

  function queueSpanishAudio(speaks: SpanishSpeakResult[]) {
    if (speaks.length === 0) return;
    const urls = speaks.map((s) => s.url).filter(Boolean);
    if (urls.length === 0) return;
    // Allow repeats across turns (TTS caching can reuse URLs). Only avoid duplicating within the active queue.
    setSpanishAudioQueue((prev) => {
      const existing = new Set(prev);
      const next = [...prev];
      for (const url of urls) {
        if (existing.has(url)) continue;
        existing.add(url);
        next.push(url);
      }
      return next;
    });
  }

  async function setSpanishBrainSetting(brain: BrainDefault) {
    setSpanishError(null);
    const prev = spanishBrainDefault;
    setSpanishBrainDefault(brain);
    const res = await callAction<any>("spanish.brain.set", { brain });
    if (!res?.ok) {
      setSpanishBrainDefault(prev);
      setSpanishError(String(res?.error ?? "Failed to set brain"));
    }
  }

  async function refreshSpanishSessions() {
    setSpanishTranscriptError(null);
    const res = await callAction<any>("spanish.sessions.list", { limit: 20 });
    if (res?.ok && Array.isArray(res.sessions)) {
      setSpanishSessions(res.sessions as SpanishSessionRow[]);
    } else {
      setSpanishTranscriptError(String(res?.error ?? "Failed to load sessions"));
    }
  }

  async function loadSpanishTranscript(sessionId: string) {
    setSpanishTranscriptError(null);
    setSpanishTranscriptSessionId(sessionId);
    const res = await callAction<any>("spanish.session.transcript", { session_id: sessionId, limit: 2000 });
    if (res?.ok && Array.isArray(res.turns)) {
      setSpanishTranscriptTurns(res.turns as SpanishTurnRow[]);
    } else {
      setSpanishTranscriptTurns([]);
      setSpanishTranscriptError(String(res?.error ?? "Failed to load transcript"));
    }
  }

  function prettyJson(raw: string | null): string | null {
    if (!raw) return null;
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }

  function formatMmSs(ms: number): string {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function parseSovtCmdSteps(prompt: string): SovtCmdStep[] {
    const lines = String(prompt ?? "").split("\n");
    const out: SovtCmdStep[] = [];
    let lastTitle = "";
    let cmdIdx = 0;

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;

      // Capture the most recent EXERCISE header so CMD steps have a human label.
      if (/^EXERCISE\s+\d+/i.test(line)) {
        lastTitle = line;
        continue;
      }

      const m = line.match(/^CMD:\s*(.+)\s*$/i);
      if (!m) continue;
      const rawCmd = m[1]?.trim() ?? "";
      if (!rawCmd) continue;

      // Tokenize the command (cards are authored without tricky quoting).
      const tokens = rawCmd.split(/\s+/).filter(Boolean);
      // Strip leading "./site-toggle" or ".../site-toggle"
      const stPos = tokens.findIndex((t) => t.endsWith("site-toggle") || t.includes("site-toggle"));
      const args = stPos >= 0 ? tokens.slice(stPos + 1) : tokens;
      if (args.length === 0) continue;

      cmdIdx += 1;
      out.push({
        idx: cmdIdx,
        title: lastTitle || `CMD ${cmdIdx}`,
        raw_cmd: rawCmd,
        args,
        status: "pending",
        started_at_ms: null,
        ended_at_ms: null,
        result_json: null,
        error: null,
      });
    }

    return out;
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard can fail depending on browser permissions. Fall back to nothing.
    }
  }

  async function sendChoiceToAgent(choice: any) {
    if (!breakMenu) return;
    const payload = {
      event_key: breakMenu.event_key,
      site: breakMenu.site,
      lane: choice?.lane ?? null,
      card: choice?.card ?? null,
      prompt: choice?.card?.prompt ?? null,
    };
    await callAction("agent.signal", { name: "break.choice", payload });
  }

  function wsSend(obj: any) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(obj));
  }

  function seekSession(from: number, to: number) {
    if (!sessionId) return;
    wsSend({ type: "run_lines.seek", session_id: sessionId, from, to });
  }

  function replayLast(n: number) {
    if (!sessionId || currentIdx === null) return;
    const start = Math.max(fromIdx, currentIdx - n);
    jumpToIdxAndReplay(start);
  }

  function jumpToIdxAndReplay(targetIdx: number) {
    if (!sessionId) return;
    if (wsState !== "open") return;

    // Cancel any pending timers from the previous playback position.
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingEventIdRef.current = null;

    // Stop any currently playing audio so the seek feels immediate.
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        // ignore
      }
    }
    setAudioNeedsGesture(false);

    // Hide any future content after the target, so replay feels like “rewinding” (not skipping).
    setTimeline((prev) => prev.filter((t) => t.idx <= targetIdx));
    setCurrentIdx(targetIdx);

    // Jump the server cursor within the existing session range (does not change from/to).
    wsSend({ type: "run_lines.jump", session_id: sessionId, target_idx: targetIdx });

    // Ensure playback continues immediately.
    // If we were already playing, the server will emit next event automatically after jump.
    if (!sessionPlaying) {
      setSessionPlaying(true);
      wsSend({ type: "run_lines.play", session_id: sessionId });
    }
  }

  const selectedTitle = useMemo(() => scripts.find((s) => s.id === selectedScriptId)?.title ?? null, [scripts, selectedScriptId]);
  const visibleTimeline = useMemo(() => timeline, [timeline]);
  const lastVisibleTimelineKey = useMemo(
    () => (visibleTimeline.length > 0 ? visibleTimeline[visibleTimeline.length - 1]!.key : null),
    [visibleTimeline],
  );

  useEffect(() => {
    // Keep the “current line” view pinned to the most recent events.
    // This avoids the user needing to manually scroll while a scene is playing.
    actingTimelineEndRef.current?.scrollIntoView({ block: "end" });
  }, [lastVisibleTimelineKey]);

  function StatusBadge() {
    const serverOk = Boolean(status?.ok);
    const sudoOk = Boolean(status?.sudo_site_toggle_ok);
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span
          className={cn(
            "rounded-full border px-2 py-0.5",
            serverOk ? "border-border" : "border-destructive/50 text-destructive",
          )}
        >
          Server: {serverOk ? "ok" : "down"}
        </span>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5",
            wsState === "open" ? "border-border" : "border-muted-foreground/30 text-muted-foreground",
          )}
        >
          WS: {wsState}
        </span>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5",
            sudoOk ? "border-border" : "border-muted-foreground/30 text-muted-foreground",
          )}
        >
          sudo: {sudoOk ? "ok" : "no"}
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <div className="mx-auto max-w-6xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Circuit Breaker</h1>
            <div className="mt-1">
              <StatusBadge />
            </div>
          </div>
          <ThemeToggle />
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="mt-4">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="break">Break</TabsTrigger>
            <TabsTrigger value="acting">Acting</TabsTrigger>
            <TabsTrigger value="spanish">Spanish</TabsTrigger>
            <TabsTrigger value="sovt">SOVT</TabsTrigger>
            <TabsTrigger value="signals">Signals</TabsTrigger>
            <TabsTrigger value="status">Status</TabsTrigger>
          </TabsList>

          <TabsContent value="status">
            <Card>
              <CardHeader>
                <CardTitle>Status</CardTitle>
                <CardDescription>Server + WS + token (debug is collapsed by default).</CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible>
                  <AccordionItem value="debug">
                    <AccordionTrigger>Raw status JSON</AccordionTrigger>
                    <AccordionContent>
                      <ScrollArea className="h-[260px] rounded-md border">
                        <pre className="p-3 text-xs">{JSON.stringify(status, null, 2)}</pre>
                      </ScrollArea>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="acting">
            <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Scripts</CardTitle>
                  <CardDescription>Click a script to load.</CardDescription>
                </CardHeader>
                <CardContent>
                  {scripts.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No scripts found.</div>
                  ) : (
                    <ScrollArea className="h-[520px] rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[64px]">ID</TableHead>
                            <TableHead>Title</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {scripts.map((s) => (
                            <TableRow key={s.id} className="cursor-pointer" onClick={() => loadScript(s.id)}>
                              <TableCell className="font-mono text-xs">{s.id}</TableCell>
                              <TableCell>
                                <div className="font-medium">{s.title}</div>
                                <div className="text-xs text-muted-foreground">
                                  {s.source_format} • {s.created_at}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Run Lines</CardTitle>
                  <CardDescription>{selectedTitle ? `Loaded: ${selectedTitle}` : "Select a script."}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="me">Me</Label>
                      <Input id="me" value={me} onChange={(e) => setMe(e.target.value)} className="w-[220px]" />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="mode">Mode</Label>
                      <select
                        id="mode"
                        value={mode}
                        onChange={(e) => setMode(e.target.value as any)}
                        className="h-9 w-[200px] rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="practice">practice</option>
                        <option value="learn">learn (reveal after)</option>
                        <option value="read_through">read-through</option>
                        <option value="speed_through">speed-through</option>
                      </select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="from">From</Label>
                      <Input
                        id="from"
                        type="number"
                        value={fromIdx}
                        onChange={(e) => setFromIdx(Number(e.target.value))}
                        className="w-[120px]"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="to">To</Label>
                      <Input id="to" type="number" value={toIdx} onChange={(e) => setToIdx(Number(e.target.value))} className="w-[120px]" />
                    </div>

                    <Button onClick={startSession} disabled={!selectedScriptId || wsState !== "open"}>
                      Start + Play
                    </Button>
                    <Button variant="secondary" onClick={playSession} disabled={!sessionId || sessionPlaying}>
                      Play
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => sessionId && wsSend({ type: "run_lines.stop", session_id: sessionId })}
                      disabled={!sessionId}
                    >
                      Stop
                    </Button>
                    <Button variant="outline" onClick={() => seekSession(fromIdx, toIdx)} disabled={!sessionId}>
                      Restart range
                    </Button>
                    <Button variant="outline" onClick={() => replayLast(10)} disabled={!sessionId || currentIdx === null}>
                      Replay last 10
                    </Button>

                    {mode !== "speed_through" ? (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => {
                            const next = Math.max(0.5, Number((speedMult / 1.15).toFixed(2)));
                            setSpeedMult(next);
                            sessionId && wsSend({ type: "run_lines.set_speed", session_id: sessionId, speed_mult: next });
                          }}
                          disabled={!sessionId}
                        >
                          Slower
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            const next = Math.min(3.0, Number((speedMult * 1.15).toFixed(2)));
                            setSpeedMult(next);
                            sessionId && wsSend({ type: "run_lines.set_speed", session_id: sessionId, speed_mult: next });
                          }}
                          disabled={!sessionId}
                        >
                          Faster
                        </Button>
                        <div className="text-sm text-muted-foreground">
                          Speed: <span className="font-mono">{speedMult.toFixed(2)}×</span>
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        Speed: <span className="font-mono">1.30×</span>
                      </div>
                    )}
                  </div>

                  <Separator />

                  <div className="text-sm text-muted-foreground">
                    Session: <span className="font-mono">{sessionId ?? "(none)"}</span> •{" "}
                    {sessionPlaying ? "playing" : "ready"} • Current idx: <span className="font-mono">{currentIdx ?? "(n/a)"}</span>
                  </div>

                  <ScrollArea className="h-[260px] rounded-md border bg-muted/20">
                    <div className="p-2 text-sm">
                      {visibleTimeline.length === 0 ? (
                        <div className="p-2 text-muted-foreground">
                          Press <b>Start + Play</b>.
                        </div>
                      ) : (
                        visibleTimeline.map((t) => {
                          const active = currentIdx === t.idx;
                          const rowClass = cn("rounded-md px-2 py-1 cursor-pointer", active && "bg-accent");
                          const showText = t.revealed && t.text;
                          if (t.kind === "direction") {
                            return (
                              <div key={t.key} className={rowClass} onClick={() => jumpToIdxAndReplay(t.idx)}>
                                <span className="mr-2 font-mono text-xs text-muted-foreground">{t.idx}</span>
                                <span className="font-mono text-xs">[DIR] {t.text}</span>
                              </div>
                            );
                          }
                          if (t.kind === "pause") {
                            return (
                              <div key={t.key} className={rowClass} onClick={() => jumpToIdxAndReplay(t.idx)}>
                                <span className="mr-2 font-mono text-xs text-muted-foreground">{t.idx}</span>
                                <b>{me}</b>: <span className="text-muted-foreground">(your turn)</span>{" "}
                                {t.cue ? <span className="text-muted-foreground">cue: “{t.cue} …”</span> : null}
                              </div>
                            );
                          }
                          if (t.kind === "gap") {
                            return (
                              <div key={t.key} className={rowClass} onClick={() => jumpToIdxAndReplay(t.idx)}>
                                <span className="mr-2 font-mono text-xs text-muted-foreground">{t.idx}</span>
                                <b>{t.speaker ?? "?"}</b>:{" "}
                                {showText ? <span>{t.text}</span> : <span className="text-muted-foreground">(waiting…)</span>}
                              </div>
                            );
                          }
                          return (
                            <div key={t.key} className={rowClass} onClick={() => jumpToIdxAndReplay(t.idx)}>
                              <span className="mr-2 font-mono text-xs text-muted-foreground">{t.idx}</span>
                              <b>{t.speaker ?? "?"}</b>:{" "}
                              {showText ? <span>{t.text}</span> : <span className="text-muted-foreground">(hidden)</span>}
                            </div>
                          );
                        })
                      )}
                      <div ref={actingTimelineEndRef} />
                    </div>
                  </ScrollArea>

                  {audioNeedsGesture ? (
                    <Alert>
                      <AlertTitle>Audio needs a click</AlertTitle>
                      <AlertDescription className="space-y-2">
                        <p>Your browser blocked autoplay. Click “Enable audio” to continue.</p>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            const audio = audioRef.current;
                            if (!audio) return;
                            audio.play().then(() => setAudioNeedsGesture(false)).catch(() => {});
                          }}
                        >
                          Enable audio
                        </Button>
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <audio ref={audioRef} controls className="w-full" />

                  <Accordion type="single" collapsible>
                    <AccordionItem value="advanced">
                      <AccordionTrigger>Advanced / Debug</AccordionTrigger>
                      <AccordionContent>
                        <div className="grid gap-4">
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2">
                              <Switch checked={readAll} onCheckedChange={(v) => setReadAll(Boolean(v))} />
                              <span className="text-sm">Read all (debug)</span>
                            </div>
                            <div className="grid gap-1.5">
                              <Label>Pause mult</Label>
                              <Input
                                type="number"
                                step="0.05"
                                value={pauseMult}
                                onChange={(e) => setPauseMult(Number(e.target.value))}
                                className="w-[140px]"
                              />
                            </div>
                            <div className="grid gap-1.5">
                              <Label>Cue words</Label>
                              <Input type="number" value={cueWords} onChange={(e) => setCueWords(Number(e.target.value))} className="w-[140px]" />
                            </div>
                            <div className="grid gap-1.5">
                              <Label>Seek idx</Label>
                              <Input type="number" value={seekIdx} onChange={(e) => setSeekIdx(Number(e.target.value))} className="w-[140px]" />
                            </div>
                            <Button variant="outline" onClick={() => jumpToIdxAndReplay(seekIdx)} disabled={!sessionId}>
                              Seek
                            </Button>
                          </div>

                          <div>
                            <div className="text-sm font-medium">Characters</div>
                            {characters.length === 0 ? (
                              <div className="text-sm text-muted-foreground">No characters loaded.</div>
                            ) : (
                              <div className="mt-2 columns-2 gap-6 text-sm">
                                {characters.map((c) => (
                                  <div key={c.normalized_name} className="break-inside-avoid">
                                    {c.name} → <span className="font-mono text-xs">{c.voice}</span>{" "}
                                    <span className="font-mono text-xs">{c.rate}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div>
                            <div className="text-sm font-medium">Full lines (debug)</div>
                            {lines.length === 0 ? (
                              <div className="text-sm text-muted-foreground">No lines loaded.</div>
                            ) : (
                              <ScrollArea className="mt-2 h-[260px] rounded-md border">
                                <div className="p-2 text-sm">
                                  {lines.map((l) => (
                                    <div key={l.idx} className="rounded-md px-2 py-1">
                                      <span className="mr-2 font-mono text-xs text-muted-foreground">{l.idx}</span>
                                      {l.type === "dialogue" ? (
                                        <span>
                                          <b>{l.speaker_normalized ?? "?"}</b>: {l.text}
                                        </span>
                                      ) : (
                                        <span className="font-mono text-xs">
                                          [{l.type}] {l.text}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </ScrollArea>
                            )}
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="break">
            <Card>
              <CardHeader>
                <CardTitle>Break Menu</CardTitle>
                <CardDescription>Load a menu, choose a lane, and keep debug behind collapsible panels.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="grid gap-1.5">
                    <Label>Site</Label>
                    <Input value={breakSite} onChange={(e) => setBreakSite(e.target.value)} className="w-[200px]" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Minutes</Label>
                    <Input type="number" value={breakMinutes} onChange={(e) => setBreakMinutes(Number(e.target.value))} className="w-[140px]" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Context</Label>
                    <Input value={breakContext} onChange={(e) => setBreakContext(e.target.value)} className="w-[200px]" />
                  </div>
                  <Button onClick={loadBreakMenu}>Load break menu</Button>
                  <Button variant="destructive" onClick={() => unblockAllFromUi(breakMinutes)}>
                    Unblock ALL ({breakMinutes} min)
                  </Button>
                  <div className="flex items-center gap-2">
                    <Switch checked={autoStartActing} onCheckedChange={(v) => setAutoStartActing(Boolean(v))} />
                    <span className="text-sm">Auto-start acting (only if 1 scene)</span>
                  </div>
                </div>

                {breakMenu ? (
                  <div className="space-y-3">
                    <div className="text-sm text-muted-foreground">
                      event_key: <span className="font-mono">{breakMenu.event_key}</span>
                    </div>
                    <div className="grid gap-2">
                      {breakMenu.lanes.map((l: any) => {
                        if (l.type === "same_need") {
                          return (
                            <Card key={`${breakMenu.event_key}-${l.type}`}>
                              <CardHeader>
                                <CardTitle className="text-base">same_need</CardTitle>
                                <CardDescription>{l.prompt}</CardDescription>
                              </CardHeader>
                              <CardContent>
                                <Button onClick={() => chooseBreakLane("same_need")}>Choose need</Button>
                              </CardContent>
                            </Card>
                          );
                        }
                        if (l.type === "feed") {
                          return (
                            <Card key={`${breakMenu.event_key}-${l.type}`}>
                              <CardHeader>
                                <CardTitle className="text-base">feed</CardTitle>
                                <CardDescription>
                                  Unblock <b>{l.site}</b> for <b>{l.minutes}</b> minutes (requires passwordless sudo).
                                </CardDescription>
                              </CardHeader>
                              <CardContent>
                                <Button variant="destructive" onClick={() => chooseBreakLane("feed")}>
                                  Unblock (feed)
                                </Button>
                              </CardContent>
                            </Card>
                          );
                        }
                        const card = l.card;
                        const laneType = String(l.type ?? "");
                        const isSpanishLane = ["verb", "noun", "lesson", "fusion"].includes(laneType);
                        const isSovtLane = laneType === "sovt";
                        return (
                          <Card key={`${breakMenu.event_key}-${l.type}-${card?.id ?? "x"}`}>
                            <CardHeader>
                              <CardTitle className="text-base">{l.type}</CardTitle>
                              <CardDescription>
                                {card?.activity ?? "(missing card)"} • {card?.minutes ?? "?"} min •{" "}
                                {card?.doneCondition ?? card?.done_condition ?? ""}
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <Button onClick={() => chooseBreakLane(l.type)}>
                                  {isSpanishLane ? "Choose (Spanish)" : isSovtLane ? "Choose (SOVT)" : laneType === "acting" ? "Choose (acting)" : "Choose"}
                                </Button>
                                {isSpanishLane ? (
                                  <Button
                                    variant="secondary"
                                    onClick={() => chooseBreakLaneAndStartSpanish(laneType as any)}
                                    disabled={spanishLoading || Boolean(spanishSessionId)}
                                  >
                                    Choose + Start Spanish
                                  </Button>
                                ) : null}
                                {isSovtLane ? (
                                  <Button variant="secondary" onClick={chooseBreakLaneAndStartSovt}>
                                    Choose + Start SOVT
                                  </Button>
                                ) : null}
                              </div>

                              {l.type === "acting" && Array.isArray(l.recent_scripts) && l.recent_scripts.length > 0 ? (
                                <Accordion type="single" collapsible>
                                  <AccordionItem value="recent">
                                    <AccordionTrigger>Recent scenes</AccordionTrigger>
                                    <AccordionContent>
                                      <div className="space-y-2 text-sm">
                                        {l.recent_scripts.slice(0, 5).map((s: any) => {
                                          const isPickerActive =
                                            actingPickerOpen &&
                                            Array.isArray(actingPickerScripts) &&
                                            actingPickerScripts.some((p) => p?.id === s?.id);
                                          return (
                                            <div
                                              key={s.id}
                                              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"
                                            >
                                              <div>
                                                <div className="font-medium">
                                                  [{s.id}] {s.title}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                  {s.character_count} chars • {s.dialogue_lines} lines
                                                </div>
                                              </div>
                                              {isPickerActive ? (
                                                <div className="flex gap-2">
                                                  <Button
                                                    variant="outline"
                                                    disabled={actingPickerLoadingId !== null}
                                                    onClick={async () => {
                                                      const id = Number(s.id);
                                                      setActingPickerLoadingId(id);
                                                      try {
                                                        setActingPickerOpen(false);
                                                        await loadAndMaybeStart(id, false);
                                                        setActiveTab("acting");
                                                      } finally {
                                                        setActingPickerLoadingId(null);
                                                      }
                                                    }}
                                                  >
                                                    {actingPickerLoadingId !== null ? "Loading..." : "Load"}
                                                  </Button>
                                                  <Button
                                                    disabled={actingPickerLoadingId !== null}
                                                    onClick={async () => {
                                                      const id = Number(s.id);
                                                      setActingPickerLoadingId(id);
                                                      try {
                                                        setActingPickerOpen(false);
                                                        await loadAndMaybeStart(id, true);
                                                        setActiveTab("acting");
                                                      } finally {
                                                        setActingPickerLoadingId(null);
                                                      }
                                                    }}
                                                  >
                                                    {actingPickerLoadingId !== null ? "Starting..." : "Load + Start"}
                                                  </Button>
                                                </div>
                                              ) : null}
                                            </div>
                                          );
                                        })}
                                        {actingPickerOpen && l.recent_scripts.length > 1 ? (
                                          <Alert>
                                            <AlertTitle>Pick a scene</AlertTitle>
                                            <AlertDescription>Multiple recent scenes found — choose one above.</AlertDescription>
                                          </Alert>
                                        ) : null}
                                      </div>
                                    </AccordionContent>
                                  </AccordionItem>
                                </Accordion>
                              ) : null}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No break menu loaded.</div>
                )}

                {breakChoice ? (
                  <Accordion type="single" collapsible>
                    <AccordionItem value="choice">
                      <AccordionTrigger>Choice result</AccordionTrigger>
                      <AccordionContent>
                        {breakChoice?.ok && breakChoice?.card?.prompt ? (
                          <Card>
                            <CardHeader>
                              <CardTitle className="text-base">Prompt</CardTitle>
                              <CardDescription>
                                The web UI can run Spanish sessions now. If you prefer an external agent runner, use the prompt below.
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              <div className="flex flex-wrap gap-2">
                                <Button variant="secondary" onClick={() => copyToClipboard(String(breakChoice.card.prompt))}>
                                  Copy prompt
                                </Button>
                                <Button
                                  onClick={async () => {
                                    await copyToClipboard(String(breakChoice.card.prompt));
                                    await sendChoiceToAgent(breakChoice);
                                  }}
                                >
                                  Send to agent (and copy)
                                </Button>
                              </div>
                              <ScrollArea className="h-[220px] rounded-md border">
                                <pre className="p-3 text-xs whitespace-pre-wrap">{String(breakChoice.card.prompt)}</pre>
                              </ScrollArea>
                            </CardContent>
                          </Card>
                        ) : null}
                        <Separator className="my-3" />
                        <ScrollArea className="h-[240px] rounded-md border">
                          <pre className="p-3 text-xs">{JSON.stringify(breakChoice, null, 2)}</pre>
                        </ScrollArea>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="spanish">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>Spanish</CardTitle>
                    <CardDescription>AI-driven Spanish tutoring sessions.</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="sp-brain" className="text-sm">Brain:</Label>
                    <select
                      id="sp-brain"
                      value={spanishBrainDefault}
                      onChange={(e) => setSpanishBrainSetting(e.target.value as BrainDefault)}
                      disabled={Boolean(spanishSessionId)}
                      className="h-8 w-[120px] rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    >
                      <option value="codex">Codex</option>
                      <option value="claude">Claude</option>
                    </select>
                    {spanishSessionId ? (
                      <span className="text-xs text-muted-foreground">(locked for session)</span>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={startSpanishSessionFromChoice} disabled={spanishLoading}>
                    Start Spanish Session (from last break choice)
                  </Button>
                  <Button variant="secondary" onClick={() => endSpanishSession("completed")} disabled={!spanishSessionId}>
                    End (completed)
                  </Button>
                  <Button variant="outline" onClick={() => endSpanishSession("abandoned")} disabled={!spanishSessionId}>
                    End (abandoned)
                  </Button>
                  <div className="text-sm text-muted-foreground">
                    session: <span className="font-mono">{spanishSessionId ?? "(none)"}</span>
                  </div>
                </div>

                {spanishError ? (
                  <Alert variant="destructive">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{spanishError}</AlertDescription>
                  </Alert>
                ) : null}

                {/* Chat history */}
                <div className="rounded-md border bg-muted/20">
                  <div className="border-b px-3 py-2 text-sm font-medium">Chat</div>
                  <ScrollArea className="h-[340px]">
                    <div className="p-3 space-y-3 text-sm">
                      {spanishMessages.length === 0 ? (
                        <div className="text-muted-foreground">Start a session to begin.</div>
                      ) : (
                        spanishMessages.map((msg, i) => (
                          <div
                            key={`${msg.timestamp}-${i}`}
                            className={cn(
                              "rounded-md px-3 py-2",
                              msg.role === "tutor" && "bg-background border",
                              msg.role === "you" && "bg-primary/10 border border-primary/20 ml-8",
                              msg.role === "system" && "text-muted-foreground text-xs italic",
                            )}
                          >
                            {msg.role !== "system" ? (
                              <div className="text-xs font-medium text-muted-foreground mb-1">
                                {msg.role === "tutor" ? "Tutor" : "You"}
                              </div>
                            ) : null}
                            <pre className="whitespace-pre-wrap text-sm font-sans">{msg.text}</pre>
                          </div>
                        ))
                      )}
                      {spanishLoading ? (
                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                          <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
                          Thinking...
                        </div>
                      ) : null}
                      <div ref={spanishChatEndRef} />
                    </div>
                  </ScrollArea>
                </div>

                {/* Answer input with Enter-to-submit */}
                {spanishSessionId && spanishBrain?.await === "user" ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex-1 min-w-[280px]">
                      <Label htmlFor="sp-answer">Your answer</Label>
                      <Input
                        id="sp-answer"
                        value={spanishAnswer}
                        onChange={(e) => setSpanishAnswer(e.target.value)}
                        placeholder="Type your answer..."
                        disabled={spanishLoading}
                        onKeyDown={(e) => {
                          if (e.nativeEvent.isComposing) return;
                          if (e.key === "Enter" && !e.shiftKey && spanishAnswer.trim()) {
                            e.preventDefault();
                            submitSpanishAnswer();
                          }
                        }}
                      />
                    </div>
                    <Button onClick={submitSpanishAnswer} disabled={!spanishAnswer.trim() || spanishLoading}>
                      Submit
                    </Button>
                  </div>
                ) : null}

                {/* Pronunciation check */}
                {spanishPendingListen ? (
                  <Alert>
                    <AlertTitle>Pronunciation check</AlertTitle>
                    <AlertDescription className="space-y-2">
                      <div>
                        Say: <span className="font-mono">{spanishPendingListen.target_text}</span>
                      </div>
                      {spanishRecording ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                          Recording: {formatMmSs(spanishRecordingElapsedMs)}
                        </div>
                      ) : null}
                      {!spanishRecording ? (
                        <Button onClick={startSpanishRecording} disabled={spanishLoading}>Record</Button>
                      ) : (
                        <Button onClick={uploadSpanishListenAttempt}>Stop + Upload ({formatMmSs(spanishRecordingElapsedMs)})</Button>
                      )}
                    </AlertDescription>
                  </Alert>
                ) : null}

                {/* Audio controls */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSpanishAudioMuted((v) => !v)}
                  >
                    {spanishAudioMuted ? "Unmute auto-play" : "Mute auto-play"}
                  </Button>
                  {spanishAudioNeedsGesture ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const audio = spanishAudioRef.current;
                        if (!audio) return;
                        audio.play().then(() => setSpanishAudioNeedsGesture(false)).catch(() => {});
                      }}
                    >
                      Enable audio
                    </Button>
                  ) : null}
                  {spanishAudioQueue.length > 0 ? (
                    <span className="text-xs text-muted-foreground">Audio queue: {spanishAudioQueue.length}</span>
                  ) : null}
                </div>
                <audio ref={spanishAudioRef} controls className="w-full" />

                {/* Audio debug + transcript in accordions */}
                <Accordion type="single" collapsible>
                  {spanishSpeakResults.length > 0 ? (
                    <AccordionItem value="audio">
                      <AccordionTrigger>Audio (debug)</AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 text-sm">
                          {spanishSpeakResults.map((r) => (
                            <div
                              key={`${r.id}-${r.audio_id}`}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"
                            >
                              <div className="text-xs">
                                <span className="font-mono">{r.id}</span> → <span className="font-mono">{r.audio_id}</span>{" "}
                                <span className="text-muted-foreground">({r.duration_sec.toFixed(2)}s)</span>
                              </div>
                              <Button variant="outline" size="sm" onClick={() => playSpanishAudio(r.url)}>
                                Play
                              </Button>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ) : null}

                  <AccordionItem value="transcript">
                    <AccordionTrigger>Transcript (debug)</AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button variant="outline" onClick={refreshSpanishSessions}>
                            Refresh sessions
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              if (spanishSessionId) loadSpanishTranscript(spanishSessionId);
                            }}
                            disabled={!spanishSessionId}
                          >
                            Load current session transcript
                          </Button>
                          {spanishTranscriptSessionId ? (
                            <span className="text-sm text-muted-foreground">
                              viewing: <span className="font-mono">{spanishTranscriptSessionId}</span>
                            </span>
                          ) : null}
                        </div>

                        {spanishTranscriptError ? (
                          <Alert variant="destructive">
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{spanishTranscriptError}</AlertDescription>
                          </Alert>
                        ) : null}

                        {spanishSessions.length === 0 ? (
                          <div className="text-sm text-muted-foreground">No sessions loaded yet.</div>
                        ) : (
                          <div className="rounded-md border">
                            <div className="border-b px-3 py-2 text-sm font-medium">Recent sessions</div>
                            <ScrollArea className="h-[160px]">
                              <div className="p-2 text-sm space-y-2">
                                {spanishSessions.map((s) => (
                                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                                    <div>
                                      <div className="font-mono text-xs">{s.id}</div>
                                      <div className="text-xs text-muted-foreground">
                                        <b>{s.status}</b> {s.lane ? `(${s.lane})` : ""} • {s.brain_name ?? "codex"} •{" "}
                                        {new Date(s.updated_at).toLocaleString()}
                                      </div>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => loadSpanishTranscript(s.id)}>
                                      View
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          </div>
                        )}

                        {spanishTranscriptTurns.length > 0 ? (
                          <div className="rounded-md border">
                            <div className="border-b px-3 py-2 text-sm font-medium">
                              Turns ({spanishTranscriptTurns.length})
                            </div>
                            <ScrollArea className="h-[320px]">
                              <div className="p-3 space-y-3 text-sm">
                                {spanishTranscriptTurns.map((t) => (
                                  <div key={t.id} className="rounded-md border p-2">
                                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                      <span className="font-mono">#{t.idx}</span>
                                      <b className="text-foreground">{t.role}</b>
                                      <span>{t.kind}</span>
                                      <span>{new Date(t.created_at).toLocaleString()}</span>
                                    </div>
                                    {t.content ? <pre className="mt-2 whitespace-pre-wrap text-sm">{t.content}</pre> : null}
                                    {t.json ? (
                                      <pre className="mt-2 whitespace-pre-wrap rounded-md bg-muted/30 p-2 text-xs">
                                        {prettyJson(t.json)}
                                      </pre>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">No transcript loaded.</div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
	              </CardContent>
	            </Card>
	          </TabsContent>

	          <TabsContent value="sovt">
	            <Card>
	              <CardHeader>
	                <CardTitle>SOVT / Pitch</CardTitle>
	                <CardDescription>Run SOVT card scripts in the browser (server plays audio locally via `site-toggle play`).</CardDescription>
	              </CardHeader>
	              <CardContent className="space-y-4">
	                <div className="flex flex-wrap items-center gap-2">
	                  <Button variant="secondary" onClick={chooseBreakLaneAndStartSovt} disabled={!breakMenu}>
	                    Load from Break menu (choose + start)
	                  </Button>
	                  <Button variant="outline" onClick={() => completeSovt("completed")} disabled={!breakMenu || !sovtCard?.id}>
	                    Mark completed
	                  </Button>
	                  <Button variant="outline" onClick={() => completeSovt("abandoned")} disabled={!breakMenu || !sovtCard?.id}>
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
	                      <pre className="mt-2 whitespace-pre-wrap rounded-md bg-muted/30 p-2 text-xs">
	                        {JSON.stringify(sovtCompletion, null, 2)}
	                      </pre>
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
	                  <div className="text-sm text-muted-foreground">
	                    Choose the `sovt` lane in the Break tab (or click “Choose + Start SOVT” there).
	                  </div>
	                )}

	                <div className="flex flex-wrap items-center gap-2">
	                  <Button
	                    onClick={() => {
	                      const next = sovtSteps.find((s) => s.status === "pending" || s.status === "error") ?? null;
	                      if (next) runSovtCmd(next.idx);
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
	                            <Button
	                              size="sm"
	                              onClick={() => runSovtCmd(s.idx)}
	                              disabled={s.status === "running" || sovtSteps.some((x) => x.status === "running")}
	                            >
	                              Run
	                            </Button>
	                          </div>
	                        </div>
	                        {s.error ? (
	                          <div className="mt-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">{s.error}</div>
	                        ) : null}
	                        {s.result_json ? (
	                          <pre className="mt-2 whitespace-pre-wrap rounded-md bg-muted/30 p-2 text-xs">{s.result_json}</pre>
	                        ) : null}
	                      </div>
	                    ))}
	                  </div>
	                )}

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
	          </TabsContent>

	          <TabsContent value="signals">
	            <Card>
	              <CardHeader>
	                <CardTitle>Signals</CardTitle>
	                <CardDescription>Most recent signals (debug).</CardDescription>
              </CardHeader>
              <CardContent>
                {signals.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No signals yet.</div>
                ) : (
                  <ScrollArea className="h-[520px] rounded-md border">
                    <div className="p-3 space-y-3">
                      {signals.slice().reverse().slice(0, 20).map((s) => (
                        <div key={s.id} className="rounded-md border p-2">
                          <div className="text-sm">
                            <b>{s.name}</b> <span className="text-xs text-muted-foreground">{s.created_at}</span>
                          </div>
                          <pre className="mt-2 whitespace-pre-wrap rounded-md bg-muted/30 p-2 text-xs">
                            {JSON.stringify(s.payload, null, 2)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
