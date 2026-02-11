import React, { useEffect, useMemo, useRef, useState } from "react";
import { callAction, fetchStatus, getToken, type ApiStatus } from "./api/client";
import { connectWs, type WsMessage } from "./ws/client";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { loadInitialUiState, persistUiState, replaceUrlFromUiState, type UiTab } from "@/lib/uiState";
import { useActingSession } from "@/hooks/useActingSession";
import { useAllGravy } from "@/hooks/useAllGravy";
import { useSpanishSession } from "@/hooks/useSpanishSession";
import { useSovtSession } from "@/hooks/useSovtSession";
import { ActingTab } from "@/tabs/ActingTab";
import { AllGravyTab } from "@/tabs/AllGravyTab";
import { BreakTab } from "@/tabs/BreakTab";
import { SignalsTab } from "@/tabs/SignalsTab";
import { SovtTab } from "@/tabs/SovtTab";
import { SpanishTab } from "@/tabs/SpanishTab";
import { StatusTab } from "@/tabs/StatusTab";

import type { BreakMenu, Signal } from "@/app/types";

export function App() {
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [wsState, setWsState] = useState<"connecting" | "open" | "closed">("connecting");

  const uiDefaults = {
    v: 1 as const,
    tab: "break" as UiTab,
    breakSite: "reddit",
    breakMinutes: 10,
    breakContext: "home",
    actingMe: "Melchior",
    actingMode: "practice" as const,
    actingFromIdx: 1,
    actingToIdx: 200,
  };
  const initialUi = useMemo(() => loadInitialUiState(uiDefaults), []);

  const [activeTab, setActiveTab] = useState<UiTab>(() => initialUi.tab ?? "break");

  const [breakSite, setBreakSite] = useState(() => initialUi.breakSite ?? "reddit");
  const [breakMinutes, setBreakMinutes] = useState<number>(() => initialUi.breakMinutes ?? 10);
  const [breakContext, setBreakContext] = useState<string>(() => initialUi.breakContext ?? "home");
  const [breakMenu, setBreakMenu] = useState<BreakMenu | null>(null);
  const [breakChoice, setBreakChoice] = useState<any | null>(null);
  const [autoStartActing, setAutoStartActing] = useState(true);
  const [actingPickerScripts, setActingPickerScripts] = useState<any[] | null>(null);
  const [actingPickerOpen, setActingPickerOpen] = useState(false);
  const [actingPickerLoadingId, setActingPickerLoadingId] = useState<number | null>(null);

  const spanish = useSpanishSession();
  const allGravy = useAllGravy();

  const wsRef = useRef<WebSocket | null>(null);

  const acting = useActingSession({
    wsRef,
    wsState,
    initial: {
      scriptId: typeof initialUi.actingScriptId === "number" ? initialUi.actingScriptId : null,
      me: initialUi.actingMe ?? undefined,
      mode: initialUi.actingMode ?? undefined,
      fromIdx: initialUi.actingFromIdx ?? undefined,
      toIdx: initialUi.actingToIdx ?? undefined,
    },
  });

  const actingOnWsMessageRef = useRef(acting.onWsMessage);
  useEffect(() => {
    actingOnWsMessageRef.current = acting.onWsMessage;
  }, [acting.onWsMessage]);

  const allGravyOnWsMessageRef = useRef(allGravy.onWsMessage);
  useEffect(() => {
    allGravyOnWsMessageRef.current = allGravy.onWsMessage;
  }, [allGravy.onWsMessage]);

  const sovt = useSovtSession();

  useEffect(() => {
    fetchStatus()
      .then((s) => setStatus(s))
      .catch(() => setStatus({ ok: false }));
  }, []);

  // Deep-link + state restore (query params + localStorage).
  // Precedence: URL params > localStorage > defaults. On change, we persist and update the URL.
  useEffect(() => {
    const st = {
      v: 1 as const,
      tab: activeTab,
      breakSite,
      breakMinutes,
      breakContext,
      actingScriptId: acting.selectedScriptId ?? undefined,
      actingMe: acting.me,
      actingMode: acting.mode,
      actingFromIdx: acting.fromIdx,
      actingToIdx: acting.toIdx,
    };
    persistUiState(st);
    replaceUrlFromUiState(st);
  }, [
    activeTab,
    breakSite,
    breakMinutes,
    breakContext,
    acting.selectedScriptId,
    acting.me,
    acting.mode,
    acting.fromIdx,
    acting.toIdx,
  ]);

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
      allGravyOnWsMessageRef.current(m);
      actingOnWsMessageRef.current(m);
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

    // Best-effort: show due counts for Spanish lanes next to the break menu.
    void spanish.refreshSpanishSrsDueCounts();
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
        await acting.loadAndMaybeStart(scriptId, true);
        setActiveTab("acting");
        return res;
      }

      // Multiple recents: prompt user to pick which one to start.
      setActingPickerScripts(recent.slice(0, 5));
      setActingPickerOpen(true);
    }

    return res;
  }

  async function chooseBreakLaneAndStartSpanish(lane: "verb" | "noun" | "lesson" | "fusion") {
    spanish.setSpanishErrorMessage(null);
    if (!breakMenu) {
      spanish.setSpanishErrorMessage("Load a break menu first.");
      return;
    }
    const choice = await chooseBreakLane(lane);
    if (!choice?.ok || !choice?.card?.prompt) {
      spanish.setSpanishErrorMessage(String(choice?.error ?? "Failed to choose lane"));
      return;
    }
    await spanish.startSpanishSession(breakMenu.event_key, lane, choice.card);
    setActiveTab("spanish");
  }

  async function chooseBreakLaneAndStartSovt() {
    await sovt.chooseBreakLaneAndStartSovt({
      breakMenu,
      chooseBreakLane,
      onSwitchToSovtTab: () => setActiveTab("sovt"),
    });
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
          <TabsList className="grid w-full grid-cols-3 md:grid-cols-7">
            <TabsTrigger value="break">Break</TabsTrigger>
            <TabsTrigger value="acting">Acting</TabsTrigger>
            <TabsTrigger value="spanish">Spanish</TabsTrigger>
            <TabsTrigger value="sovt">SOVT</TabsTrigger>
            <TabsTrigger value="allgravy">All Gravy</TabsTrigger>
            <TabsTrigger value="signals">Signals</TabsTrigger>
            <TabsTrigger value="status">Status</TabsTrigger>
          </TabsList>

          <TabsContent value="status">
            <StatusTab status={status} />
          </TabsContent>

          <TabsContent value="acting">
            <ActingTab
              scripts={acting.scripts}
              selectedScriptId={acting.selectedScriptId}
              selectedTitle={acting.selectedTitle}
              wsState={wsState}
              me={acting.me}
              setMe={acting.setMe}
              mode={acting.mode}
              setMode={acting.setMode}
              readAll={acting.readAll}
              setReadAll={acting.setReadAll}
              fromIdx={acting.fromIdx}
              setFromIdx={acting.setFromIdx}
              toIdx={acting.toIdx}
              setToIdx={acting.setToIdx}
              pauseMult={acting.pauseMult}
              setPauseMult={acting.setPauseMult}
              cueWords={acting.cueWords}
              setCueWords={acting.setCueWords}
              speedMult={acting.speedMult}
              setSpeedMult={acting.setSpeedMult}
              seekIdx={acting.seekIdx}
              setSeekIdx={acting.setSeekIdx}
              sessionId={acting.sessionId}
              sessionPlaying={acting.sessionPlaying}
              currentIdx={acting.currentIdx}
              timeline={acting.timeline}
              actingTimelineEndRef={acting.actingTimelineEndRef}
              characters={acting.characters}
              lines={acting.lines}
              audioNeedsGesture={acting.audioNeedsGesture}
              audioErrorIdx={acting.audioErrorIdx}
              onRetryErroredLine={acting.onRetryErroredLine}
              onEnableAudio={acting.onEnableAudio}
              audioRef={acting.audioRef}
              onLoadScript={(id) => void acting.loadScript(id)}
              onStart={acting.startSession}
              onPlay={acting.playSession}
              onStop={acting.stopSession}
              onRestartRange={() => acting.seekSession(acting.fromIdx, acting.toIdx)}
              onReplayLast={acting.replayLast}
              onSlower={acting.onSlower}
              onFaster={acting.onFaster}
              onSeek={() => acting.jumpToIdxAndReplay(acting.seekIdx)}
              onJumpToIdxAndReplay={acting.jumpToIdxAndReplay}
            />
          </TabsContent>

          <TabsContent value="break">
            <BreakTab
              breakSite={breakSite}
              setBreakSite={setBreakSite}
              breakMinutes={breakMinutes}
              setBreakMinutes={setBreakMinutes}
              breakContext={breakContext}
              setBreakContext={setBreakContext}
              autoStartActing={autoStartActing}
              setAutoStartActing={setAutoStartActing}
              breakMenu={breakMenu}
              breakChoice={breakChoice}
              spanishSrsDueCounts={spanish.spanishSrsDueCounts}
              loadBreakMenu={() => void loadBreakMenu()}
              unblockAllFromUi={(m) => void unblockAllFromUi(m)}
              chooseBreakLane={(lane) => void chooseBreakLane(lane)}
              chooseBreakLaneAndStartSpanish={(lane) => void chooseBreakLaneAndStartSpanish(lane)}
              chooseBreakLaneAndStartSovt={() => void chooseBreakLaneAndStartSovt()}
              spanishLoading={spanish.spanishLoading}
              spanishSessionId={spanish.spanishSessionId}
              actingPickerOpen={actingPickerOpen}
              actingPickerScripts={actingPickerScripts}
              actingPickerLoadingId={actingPickerLoadingId}
              setActingPickerOpen={setActingPickerOpen}
              setActingPickerLoadingId={setActingPickerLoadingId}
              loadAndMaybeStart={acting.loadAndMaybeStart}
              switchToActingTab={() => setActiveTab("acting")}
              copyToClipboard={copyToClipboard}
              sendChoiceToAgent={sendChoiceToAgent}
            />
          </TabsContent>

          <TabsContent value="allgravy">
            <AllGravyTab
              reposText={allGravy.reposText}
              setReposText={allGravy.setReposText}
              repos={allGravy.repos}
              brain={allGravy.brain}
              loadingSettings={allGravy.loadingSettings}
              refreshing={allGravy.refreshing}
              generatingForPr={allGravy.generatingForPr}
              applyingProposal={allGravy.applyingProposal}
              approvingPr={allGravy.approvingPr}
              runId={allGravy.runId}
              prs={allGravy.prs}
              queueErrors={allGravy.queueErrors}
              selectedPrId={allGravy.selectedPrId}
              selectedPr={allGravy.selectedPr}
              selectedPatches={allGravy.selectedPatches}
              selectedProposals={allGravy.selectedProposals}
              error={allGravy.error}
              setError={allGravy.setError}
              saveReposFromText={() => allGravy.saveReposFromText()}
              saveBrain={(b) => allGravy.saveBrain(b)}
              loadLatestQueue={() => allGravy.loadLatestQueue()}
              refreshQueue={() => allGravy.refreshQueue()}
              selectPr={(id) => allGravy.selectPr(id)}
              generateProposals={(id) => allGravy.generateProposals(id)}
              applyProposal={(id, body) => allGravy.applyProposal(id, body)}
              discardProposal={(id) => allGravy.discardProposal(id)}
              approve={(id) => allGravy.approve(id)}
              counts={allGravy.counts}
            />
          </TabsContent>

          <TabsContent value="spanish">
            <SpanishTab
              spanishBrainDefault={spanish.spanishBrainDefault}
              setSpanishBrainSetting={spanish.setSpanishBrainSetting}
              spanishSessionId={spanish.spanishSessionId}
              spanishSessionLane={spanish.spanishSessionLane}
              spanishSessionSource={spanish.spanishSessionSource}
              spanishBrain={spanish.spanishBrain}
              spanishLoading={spanish.spanishLoading}
              spanishError={spanish.spanishError}
              clearSpanishError={() => spanish.setSpanishErrorMessage(null)}
              spanishMessages={spanish.spanishMessages}
              spanishChatEndRef={spanish.spanishChatEndRef}
              spanishSrsDueCounts={spanish.spanishSrsDueCounts}
              canStartFromBreakChoice={Boolean(
                breakMenu &&
                  breakChoice?.ok &&
                  breakChoice?.card?.prompt &&
                  ["verb", "noun", "lesson", "fusion"].includes(String(breakChoice?.lane ?? "")),
              )}
              onGoToBreakTab={() => setActiveTab("break")}
              startSpanishSessionFromChoice={() => void spanish.startSpanishSessionFromChoice(breakMenu, breakChoice)}
              startSpanishDueSession={(lane) => void spanish.startSpanishDueSession(lane)}
              endSpanishSession={(s) => void spanish.endSpanishSession(s)}
              spanishAnswer={spanish.spanishAnswer}
              setSpanishAnswer={spanish.setSpanishAnswer}
              submitSpanishAnswer={() => void spanish.submitSpanishAnswer()}
              spanishPendingListen={spanish.spanishPendingListen}
              spanishRecording={spanish.spanishRecording}
              spanishRecordingElapsedMs={spanish.spanishRecordingElapsedMs}
              startSpanishRecording={() => void spanish.startSpanishRecording()}
              uploadSpanishListenAttempt={() => void spanish.uploadSpanishListenAttempt()}
              spanishSpeakResults={spanish.spanishSpeakResults}
              spanishAudioQueueLen={spanish.spanishAudioQueueLen}
              spanishAudioMuted={spanish.spanishAudioMuted}
              toggleSpanishAudioMuted={spanish.toggleSpanishAudioMuted}
              spanishAudioNeedsGesture={spanish.spanishAudioNeedsGesture}
              enableSpanishAudio={spanish.enableSpanishAudio}
              spanishAudioRef={spanish.spanishAudioRef}
              refreshSpanishSessions={() => void spanish.refreshSpanishSessions()}
              loadSpanishTranscript={(id) => void spanish.loadSpanishTranscript(id)}
              spanishSessions={spanish.spanishSessions}
              spanishTranscriptSessionId={spanish.spanishTranscriptSessionId}
              spanishTranscriptTurns={spanish.spanishTranscriptTurns}
              spanishTranscriptError={spanish.spanishTranscriptError}
            />
          </TabsContent>

          <TabsContent value="sovt">
            <SovtTab
              breakMenuLoaded={Boolean(breakMenu)}
              sovtCard={sovt.sovtCard}
              sovtEventKey={sovt.sovtEventKey}
              sovtError={sovt.sovtError}
              sovtCompletion={sovt.sovtCompletion}
              sovtSteps={sovt.sovtSteps}
              chooseBreakLaneAndStartSovt={() => void chooseBreakLaneAndStartSovt()}
              onGoToBreakTab={() => setActiveTab("break")}
              runSovtCmd={(idx) => sovt.runSovtCmd(idx)}
              completeSovt={(s) => void sovt.completeSovt(s)}
            />
          </TabsContent>

          <TabsContent value="signals">
            <SignalsTab signals={signals} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
