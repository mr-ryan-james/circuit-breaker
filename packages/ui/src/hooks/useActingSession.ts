import React from "react";

import { callAction } from "@/api/client";
import type { CharacterRow, LineRow, ScriptRow, TimelineItem } from "@/app/types";
import { sendWs, type WsMessage } from "@/ws/client";

export type ActingWsState = "connecting" | "open" | "closed";

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

export function useActingSession(args: {
  wsRef: React.RefObject<WebSocket | null>;
  wsState: ActingWsState;
  initial?: {
    scriptId?: number | null;
    me?: string;
    mode?: "practice" | "learn" | "read_through" | "speed_through";
    fromIdx?: number;
    toIdx?: number;
  };
}) {
  const { wsRef, wsState, initial } = args;

  const [scripts, setScripts] = React.useState<ScriptRow[]>([]);
  const [selectedScriptId, setSelectedScriptId] = React.useState<number | null>(
    typeof initial?.scriptId === "number" ? initial?.scriptId : null,
  );
  const [characters, setCharacters] = React.useState<CharacterRow[]>([]);
  const [lines, setLines] = React.useState<LineRow[]>([]);

  const [me, setMe] = React.useState<string>(initial?.me ?? "Melchior");
  const [mode, setMode] = React.useState<"practice" | "learn" | "read_through" | "speed_through">(initial?.mode ?? "practice");
  const [readAll, setReadAll] = React.useState(false);
  const [fromIdx, setFromIdx] = React.useState<number>(typeof initial?.fromIdx === "number" ? initial.fromIdx : 1);
  const [toIdx, setToIdx] = React.useState<number>(typeof initial?.toIdx === "number" ? initial.toIdx : 200);
  const [pauseMult, setPauseMult] = React.useState(1.0);
  const [cueWords, setCueWords] = React.useState(0);
  const [speedMult, setSpeedMult] = React.useState(1.0);
  const [seekIdx, setSeekIdx] = React.useState<number>(typeof initial?.fromIdx === "number" ? initial.fromIdx : 1);

  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [sessionPlaying, setSessionPlaying] = React.useState(false);
  const [currentIdx, setCurrentIdx] = React.useState<number | null>(null);
  const [timeline, setTimeline] = React.useState<TimelineItem[]>([]);
  const [audioNeedsGesture, setAudioNeedsGesture] = React.useState(false);
  const [audioErrorIdx, setAudioErrorIdx] = React.useState<number | null>(null);

  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const actingTimelineEndRef = React.useRef<HTMLDivElement | null>(null);

  const pendingEventIdRef = React.useRef<string | null>(null);
  const timerRef = React.useRef<number | null>(null);
  const autoPlayOnNextStartRef = React.useRef(false);
  const seenEventIdsRef = React.useRef<Set<string>>(new Set());
  const timelineTailLimit = 2000;

  const meRef = React.useRef(me);
  React.useEffect(() => {
    meRef.current = me;
  }, [me]);

  const selectedTitle = React.useMemo(
    () => scripts.find((s) => s.id === selectedScriptId)?.title ?? null,
    [scripts, selectedScriptId],
  );

  React.useEffect(() => {
    // Best-effort: load scripts list for the picker.
    void (async () => {
      try {
        const res = await callAction<{ ok: boolean; scripts: ScriptRow[] }>("acting.scripts.list", { limit: 10 });
        if (res.ok) setScripts(res.scripts);
      } catch {
        // ignore
      }
    })();
  }, []);

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

  // On refresh, if we have a persisted script id, load it without requiring user re-entry.
  const restoredOnceRef = React.useRef(false);
  React.useEffect(() => {
    if (restoredOnceRef.current) return;
    if (!selectedScriptId) return;
    restoredOnceRef.current = true;

    const preferredFrom = fromIdx;
    const preferredTo = toIdx;

    void (async () => {
      const range = await loadScript(selectedScriptId);
      if (!range) return;
      const nextFrom = clamp(range.from, range.to, preferredFrom);
      const nextTo = clamp(range.from, range.to, preferredTo);
      setFromIdx(nextFrom);
      setToIdx(nextTo);
      setSeekIdx(nextFrom);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedScriptId]);

  function startSessionWith(scriptId: number, from: number, to: number, opts: { autoPlay?: boolean } = {}) {
    if (wsState !== "open") return;
    setTimeline([]);
    setSessionPlaying(false);
    setAudioErrorIdx(null);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    autoPlayOnNextStartRef.current = Boolean(opts.autoPlay);

    const rawMode = mode;
    const revealAfter = rawMode === "learn";
    sendWs(wsRef.current, {
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
    });
  }

  function startSession(): void {
    if (!selectedScriptId) return;
    startSessionWith(selectedScriptId, fromIdx, toIdx, { autoPlay: true });
  }

  function playSession(): void {
    if (!sessionId) return;
    setSessionPlaying(true);
    sendWs(wsRef.current, { type: "run_lines.play", session_id: sessionId });
  }

  function stopSession(): void {
    if (!sessionId) return;
    sendWs(wsRef.current, { type: "run_lines.stop", session_id: sessionId });
  }

  function seekSession(from: number, to: number) {
    if (!sessionId) return;
    setAudioErrorIdx(null);
    sendWs(wsRef.current, { type: "run_lines.seek", session_id: sessionId, from, to });
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
    setAudioErrorIdx(null);

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
    sendWs(wsRef.current, { type: "run_lines.jump", session_id: sessionId, target_idx: targetIdx });

    // Ensure playback continues immediately.
    // If we were already playing, the server will emit next event automatically after jump.
    if (!sessionPlaying) {
      setSessionPlaying(true);
      sendWs(wsRef.current, { type: "run_lines.play", session_id: sessionId });
    }
  }

  function onEnableAudio(): void {
    const audio = audioRef.current;
    if (!audio) return;
    audio.play().then(() => setAudioNeedsGesture(false)).catch(() => {});
  }

  function onRetryErroredLine(): void {
    if (audioErrorIdx === null) return;
    jumpToIdxAndReplay(audioErrorIdx);
  }

  function onSlower(): void {
    const next = Math.max(0.5, Number((speedMult / 1.15).toFixed(2)));
    setSpeedMult(next);
    sessionId && sendWs(wsRef.current, { type: "run_lines.set_speed", session_id: sessionId, speed_mult: next });
  }

  function onFaster(): void {
    const next = Math.min(3.0, Number((speedMult * 1.15).toFixed(2)));
    setSpeedMult(next);
    sessionId && sendWs(wsRef.current, { type: "run_lines.set_speed", session_id: sessionId, speed_mult: next });
  }

  function onWsMessage(m: WsMessage): void {
    if (m.type === "run_lines.session" && m.event === "started") {
      setSessionId(m.session_id);
      const shouldAutoPlay = autoPlayOnNextStartRef.current;
      autoPlayOnNextStartRef.current = false;
      setSessionPlaying(shouldAutoPlay);
      setCurrentIdx(null);
      setTimeline([]);
      setAudioErrorIdx(null);
      seenEventIdsRef.current = new Set();
      setAudioNeedsGesture(false);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;

      if (shouldAutoPlay) {
        sendWs(wsRef.current, { type: "run_lines.play", session_id: m.session_id });
      }
      return;
    }

    if (m.type === "run_lines.session" && m.event === "ended") {
      setSessionId(null);
      setSessionPlaying(false);
      setAudioErrorIdx(null);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      seenEventIdsRef.current = new Set();
      setAudioNeedsGesture(false);
      return;
    }

    if (m.type === "run_lines.session" && m.event === "seeked") {
      setCurrentIdx(null);
      setTimeline([]);
      setAudioErrorIdx(null);
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
      setAudioErrorIdx(null);

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

    if (m.type !== "run_lines.event") return;

    // Defensive: ignore duplicate WS events (can happen due to retries/reconnects or accidental replays).
    const eventId = String(m.event_id ?? "");
    if (eventId) {
      const seen = seenEventIdsRef.current;
      if (seen.has(eventId)) return;
      seen.add(eventId);
    }

    pendingEventIdRef.current = m.event_id;
    setCurrentIdx(m.idx);
    setAudioErrorIdx(null);

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
      sendWs(wsRef.current, { type: "run_lines.ack", session_id: m.session_id, event_id: m.event_id, status: "done" });
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
        sendWs(wsRef.current, { type: "run_lines.ack", session_id: m.session_id, event_id: m.event_id, status: "done" });
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
        speaker: meRef.current,
        text: null,
        revealed: false,
        cue: m.cue ?? null,
      });
      const ms = Math.max(0, Math.round((m.duration_sec ?? 0) * 1000));
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        sendWs(wsRef.current, { type: "run_lines.ack", session_id: m.session_id, event_id: m.event_id, status: "done" });
      }, ms);
      return;
    }

    if (m.kind === "line" && m.audio?.url) {
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
        setAudioErrorIdx(null);
        sendWs(wsRef.current, { type: "run_lines.ack", session_id: m.session_id, event_id: m.event_id, status: "done" });
      };
      audio.onerror = () => {
        // If audio fails to load/decode, don't deadlock the server's ack loop.
        setAudioErrorIdx(m.idx);
        sendWs(wsRef.current, { type: "run_lines.ack", session_id: m.session_id, event_id: m.event_id, status: "done" });
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

  const lastVisibleTimelineKey = React.useMemo(
    () => (timeline.length > 0 ? timeline[timeline.length - 1]!.key : null),
    [timeline],
  );

  React.useEffect(() => {
    // Keep the timeline view pinned to the most recent events.
    actingTimelineEndRef.current?.scrollIntoView({ block: "end" });
  }, [lastVisibleTimelineKey]);

  async function loadAndMaybeStart(scriptId: number, start: boolean): Promise<void> {
    const range = await loadScript(scriptId);
    if (!range) return;
    if (start) startSessionWith(scriptId, range.from, range.to, { autoPlay: true });
  }

  return {
    scripts,
    selectedScriptId,
    selectedTitle,
    characters,
    lines,

    me,
    setMe,
    mode,
    setMode,
    readAll,
    setReadAll,
    fromIdx,
    setFromIdx,
    toIdx,
    setToIdx,
    pauseMult,
    setPauseMult,
    cueWords,
    setCueWords,
    speedMult,
    setSpeedMult,
    seekIdx,
    setSeekIdx,

    sessionId,
    sessionPlaying,
    currentIdx,
    timeline,

    audioNeedsGesture,
    audioRef,
    onEnableAudio,

    actingTimelineEndRef,

    audioErrorIdx,
    onRetryErroredLine,

    loadScript,
    loadAndMaybeStart,
    startSession,
    playSession,
    stopSession,
    seekSession,
    replayLast,
    onSlower,
    onFaster,
    jumpToIdxAndReplay,

    onWsMessage,
  };
}

