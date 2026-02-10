import React from "react";

import { callAction, fetchStatus, getToken } from "@/api/client";
import type {
  BrainDefault,
  BreakMenu,
  SpanishBrain,
  SpanishMessage,
  SpanishPendingListen,
  SpanishSessionRow,
  SpanishSpeakResult,
  SpanishTurnRow,
} from "@/app/types";

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

export function useSpanishSession() {
  const [spanishSrsDueCounts, setSpanishSrsDueCounts] = React.useState<{ verb: number; noun: number; lesson: number } | null>(
    null,
  );

  const [spanishSessionId, setSpanishSessionId] = React.useState<string | null>(null);
  const [spanishBrain, setSpanishBrain] = React.useState<SpanishBrain | null>(null);
  const [spanishAnswer, setSpanishAnswer] = React.useState("");
  const [spanishSpeakResults, setSpanishSpeakResults] = React.useState<SpanishSpeakResult[]>([]);
  const [spanishPendingListen, setSpanishPendingListen] = React.useState<SpanishPendingListen | null>(null);
  const [spanishError, setSpanishError] = React.useState<string | null>(null);
  const [spanishRecording, setSpanishRecording] = React.useState(false);
  const [spanishRecordingStartedAtMs, setSpanishRecordingStartedAtMs] = React.useState<number | null>(null);
  const [spanishRecordingElapsedMs, setSpanishRecordingElapsedMs] = React.useState<number>(0);
  const [spanishSessions, setSpanishSessions] = React.useState<SpanishSessionRow[]>([]);
  const [spanishTranscriptSessionId, setSpanishTranscriptSessionId] = React.useState<string | null>(null);
  const [spanishTranscriptTurns, setSpanishTranscriptTurns] = React.useState<SpanishTurnRow[]>([]);
  const [spanishTranscriptError, setSpanishTranscriptError] = React.useState<string | null>(null);

  // Brain default, chat history, loading, audio queue.
  const [spanishBrainDefault, setSpanishBrainDefault] = React.useState<BrainDefault>("codex");
  const [spanishMessages, setSpanishMessages] = React.useState<SpanishMessage[]>([]);
  const [spanishLoading, setSpanishLoading] = React.useState(false);
  const [spanishAudioQueue, setSpanishAudioQueue] = React.useState<string[]>([]);
  const [spanishAudioMuted, setSpanishAudioMuted] = React.useState(false);
  const [spanishAudioNeedsGesture, setSpanishAudioNeedsGesture] = React.useState(false);

  const spanishAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const spanishChatEndRef = React.useRef<HTMLDivElement | null>(null);
  const spanishRequestIdRef = React.useRef(0);

  const spanishRecorderRef = React.useRef<{
    stream: MediaStream;
    audioCtx: AudioContext;
    source: MediaStreamAudioSourceNode;
    proc: ScriptProcessorNode;
    chunks: Float32Array[];
    sampleRate: number;
  } | null>(null);

  React.useEffect(() => {
    // Best-effort: load the server's preferred brain default.
    void (async () => {
      try {
        const brain = await callAction<{ ok: boolean; brain: string }>("spanish.brain.get", {});
        if (brain.ok && (brain.brain === "codex" || brain.brain === "claude")) setSpanishBrainDefault(brain.brain);
      } catch {
        // ignore
      }
    })();
  }, []);

  React.useEffect(() => {
    if (!spanishRecording || !spanishRecordingStartedAtMs) return;
    const id = window.setInterval(() => {
      setSpanishRecordingElapsedMs(Math.max(0, Date.now() - spanishRecordingStartedAtMs));
    }, 200);
    return () => window.clearInterval(id);
  }, [spanishRecording, spanishRecordingStartedAtMs]);

  // Auto-scroll Spanish chat to bottom on new messages.
  React.useEffect(() => {
    spanishChatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [spanishMessages]);

  // Auto-play Spanish audio queue.
  React.useEffect(() => {
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

  async function refreshSpanishSrsDueCounts(): Promise<void> {
    try {
      const res = await callAction<any>("spanish.srs.due", {});
      if (res?.ok && res?.lanes) {
        setSpanishSrsDueCounts({
          verb: Number(res.lanes.verb ?? 0) || 0,
          noun: Number(res.lanes.noun ?? 0) || 0,
          lesson: Number(res.lanes.lesson ?? 0) || 0,
        });
      } else {
        setSpanishSrsDueCounts(null);
      }
    } catch {
      setSpanishSrsDueCounts(null);
    }
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

  async function startSpanishSessionFromChoice(breakMenu: BreakMenu | null, breakChoice: any | null): Promise<void> {
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

  async function startSpanishDueSession(lane: "verb" | "noun" | "lesson"): Promise<void> {
    setSpanishError(null);
    const reqId = ++spanishRequestIdRef.current;
    setSpanishLoading(true);
    setSpanishMessages([{ role: "system", text: `Starting due review (${lane}) (${spanishBrainDefault})...`, timestamp: Date.now() }]);
    setSpanishSpeakResults([]);
    setSpanishPendingListen(null);
    setSpanishAudioQueue([]);
    setSpanishAudioNeedsGesture(false);

    try {
      const res = await callAction<any>("spanish.session.start_due", { lane });
      if (spanishRequestIdRef.current !== reqId) return; // stale

      if (!res?.ok) {
        const msg =
          res?.error === "no_due_cards" ? `No due cards for lane "${lane}".` : String(res?.error ?? "Failed to start due session");
        setSpanishError(msg);
        return;
      }

      setSpanishSessionId(String(res.session_id));
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

  async function submitSpanishAnswer(): Promise<void> {
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

  async function endSpanishSession(status: "completed" | "abandoned") {
    setSpanishError(null);
    if (!spanishSessionId) return;
    ++spanishRequestIdRef.current; // invalidate any in-flight requests
    await callAction<any>("spanish.session.end", { session_id: spanishSessionId, status });
    resetSpanishSessionLocal();
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

  async function uploadSpanishListenAttempt() {
    setSpanishError(null);
    if (!spanishSessionId) return;
    const wav = await stopSpanishRecordingToWav16k();
    if (!wav) return;

    let t = getToken();
    if (!t) {
      // Token rotates on server restart. Best-effort refresh.
      try {
        await fetchStatus();
      } catch {
        // ignore
      }
      t = getToken();
    }
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

  function toggleSpanishAudioMuted(): void {
    setSpanishAudioMuted((v) => !v);
  }

  function enableSpanishAudio(): void {
    const audio = spanishAudioRef.current;
    if (!audio) return;
    audio.play().then(() => setSpanishAudioNeedsGesture(false)).catch(() => {});
  }

  return {
    setSpanishErrorMessage: setSpanishError,
    spanishSrsDueCounts,
    refreshSpanishSrsDueCounts,

    spanishBrainDefault,
    setSpanishBrainSetting,

    spanishSessionId,
    spanishBrain,
    spanishLoading,
    spanishError,
    spanishMessages,
    spanishChatEndRef,

    spanishAnswer,
    setSpanishAnswer,
    submitSpanishAnswer,

    startSpanishSession,
    startSpanishSessionFromChoice,
    startSpanishDueSession,
    endSpanishSession,

    spanishPendingListen,
    spanishRecording,
    spanishRecordingElapsedMs,
    startSpanishRecording,
    uploadSpanishListenAttempt,

    spanishSpeakResults,
    spanishAudioQueueLen: spanishAudioQueue.length,
    spanishAudioMuted,
    toggleSpanishAudioMuted,
    spanishAudioNeedsGesture,
    enableSpanishAudio,
    spanishAudioRef,

    refreshSpanishSessions,
    loadSpanishTranscript,
    spanishSessions,
    spanishTranscriptSessionId,
    spanishTranscriptTurns,
    spanishTranscriptError,
  };
}
