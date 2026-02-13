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

function pickSpanishRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/wav"];
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      // ignore
    }
  }
  return undefined;
}

function extensionForSpanishMime(mimeType: string): string {
  const m = String(mimeType || "").toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("mp4") || m.includes("m4a")) return "m4a";
  if (m.includes("wav")) return "wav";
  return "bin";
}

export function useSpanishSession() {
  const [spanishSrsDueCounts, setSpanishSrsDueCounts] = React.useState<{ verb: number; noun: number; lesson: number } | null>(
    null,
  );

  const [spanishSessionId, setSpanishSessionId] = React.useState<string | null>(null);
  const [spanishSessionLane, setSpanishSessionLane] = React.useState<string | null>(null);
  const [spanishSessionSource, setSpanishSessionSource] = React.useState<"break_choice" | "srs_due" | null>(null);
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
    mediaRecorder: MediaRecorder;
    chunks: Blob[];
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
    setSpanishSessionLane(null);
    setSpanishSessionSource(null);
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

  async function startSpanishSession(
    eventKey: string,
    lane: string,
    card: any,
    source: "break_choice" | "srs_due" = "break_choice",
  ): Promise<void> {
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
      setSpanishSessionLane(lane);
      setSpanishSessionSource(source);
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
      setSpanishSessionLane(lane);
      setSpanishSessionSource("srs_due");
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
    if (spanishRecording) return;

    try {
      if (typeof MediaRecorder === "undefined") {
        throw new Error("MediaRecorder is not available in this browser");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } as any,
      });
      const mimeType = pickSpanishRecorderMimeType();
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (evt) => {
        if (evt.data && evt.data.size > 0) chunks.push(evt.data);
      };
      mr.start();

      spanishRecorderRef.current = { stream, mediaRecorder: mr, chunks };
      setSpanishRecording(true);
      setSpanishRecordingStartedAtMs(Date.now());
      setSpanishRecordingElapsedMs(0);
    } catch (e: unknown) {
      setSpanishError(e instanceof Error ? e.message : String(e));
      spanishRecorderRef.current = null;
      setSpanishRecording(false);
      setSpanishRecordingStartedAtMs(null);
      setSpanishRecordingElapsedMs(0);
    }
  }

  async function stopSpanishRecordingToBlob(): Promise<{ blob: Blob; mimeType: string } | null> {
    const r = spanishRecorderRef.current;
    if (!r) return null;

    const blob = await new Promise<Blob>((resolve) => {
      r.mediaRecorder.onstop = () =>
        resolve(new Blob(r.chunks, { type: r.mediaRecorder.mimeType || "audio/webm" }));
      try {
        r.mediaRecorder.stop();
      } catch {
        resolve(new Blob(r.chunks, { type: r.mediaRecorder.mimeType || "audio/webm" }));
      }
    });

    r.stream.getTracks().forEach((t) => t.stop());
    spanishRecorderRef.current = null;
    setSpanishRecording(false);
    setSpanishRecordingStartedAtMs(null);
    setSpanishRecordingElapsedMs(0);

    return { blob, mimeType: blob.type || "audio/webm" };
  }

  async function uploadSpanishListenAttempt() {
    setSpanishError(null);
    if (!spanishSessionId) return;
    const recorded = await stopSpanishRecordingToBlob();
    if (!recorded) return;

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
      const ext = extensionForSpanishMime(recorded.mimeType);
      fd.append("attempt_audio", recorded.blob, "attempt." + ext);
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
    spanishSessionLane,
    spanishSessionSource,
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
