import React from "react";

import type { CharacterRow, LineRow, ScriptRow, TimelineItem } from "@/app/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/NativeSelect";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SessionBanner } from "@/components/SessionBanner";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function ActingTab(props: {
  scripts: ScriptRow[];
  selectedScriptId: number | null;
  selectedTitle: string | null;
  wsState: "connecting" | "open" | "closed";

  me: string;
  setMe: (v: string) => void;
  mode: "practice" | "learn" | "read_through" | "speed_through";
  setMode: (v: "practice" | "learn" | "read_through" | "speed_through") => void;

  readAll: boolean;
  setReadAll: (v: boolean) => void;
  fromIdx: number;
  setFromIdx: (v: number) => void;
  toIdx: number;
  setToIdx: (v: number) => void;
  pauseMult: number;
  setPauseMult: (v: number) => void;
  cueWords: number;
  setCueWords: (v: number) => void;
  speedMult: number;
  setSpeedMult: (v: number) => void;
  seekIdx: number;
  setSeekIdx: (v: number) => void;

  sessionId: string | null;
  sessionPlaying: boolean;
  currentIdx: number | null;
  timeline: TimelineItem[];
  actingTimelineEndRef: React.RefObject<HTMLDivElement>;

  characters: CharacterRow[];
  lines: LineRow[];

  audioNeedsGesture: boolean;
  audioErrorIdx: number | null;
  onRetryErroredLine: () => void;
  onEnableAudio: () => void;
  audioRef: React.RefObject<HTMLAudioElement>;

  onLoadScript: (id: number) => void;
  onStart: () => void;
  onPlay: () => void;
  onStop: () => void;
  onRestartRange: () => void;
  onReplayLast: (n: number) => void;
  onSlower: () => void;
  onFaster: () => void;
  onSeek: () => void;
  onJumpToIdxAndReplay: (idx: number) => void;
}) {
  const {
    scripts,
    selectedScriptId,
    selectedTitle,
    wsState,

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
    actingTimelineEndRef,
    characters,
    lines,

    audioNeedsGesture,
    audioErrorIdx,
    onRetryErroredLine,
    onEnableAudio,
    audioRef,

    onLoadScript,
    onStart,
    onPlay,
    onStop,
    onRestartRange,
    onReplayLast,
    onSlower,
    onFaster,
    onSeek,
    onJumpToIdxAndReplay,
  } = props;

  const characterNames = React.useMemo(() => {
    const unique = new Set<string>();
    for (const c of characters) {
      const name = String(c.name ?? "").trim();
      if (name) unique.add(name);
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [characters]);

  const [useCustomMe, setUseCustomMe] = React.useState(false);

  React.useEffect(() => {
    if (!me) {
      setUseCustomMe(true);
      return;
    }
    setUseCustomMe(characterNames.length > 0 && !characterNames.includes(me));
  }, [characterNames, me]);

  const rangeInvalid = fromIdx > toIdx;
  const totalLines = lines.length;
  const totalInRange = Math.max(1, toIdx - fromIdx + 1);
  const progressUnits = currentIdx === null ? 0 : Math.max(0, Math.min(totalInRange, currentIdx - fromIdx + 1));
  const progressPct = Math.round((progressUnits / totalInRange) * 100);

  const modeHelp: Record<typeof mode, string> = {
    practice: "Other parts read aloud, your part pauses for you.",
    learn: "Other parts read aloud, your line is revealed after the pause.",
    read_through: "All parts read aloud including your lines.",
    speed_through: "Fast playback, no long pauses, 1.30x speed.",
  };

  const startDisabledReason = !selectedScriptId
    ? "Load a script first"
    : wsState !== "open"
      ? "WebSocket disconnected — check server status"
      : rangeInvalid
        ? "From must be less than or equal to To"
        : null;

  const characterSummary =
    characterNames.length > 0
      ? characters
          .slice(0, 6)
          .map((c) => `${c.name}: ${c.voice}`)
          .join(" • ")
      : "No characters loaded yet.";

  return (
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
                    <TableRow
                      key={s.id}
                      className={cn("cursor-pointer", selectedScriptId === s.id && "bg-accent/40")}
                      onClick={() => onLoadScript(s.id)}
                    >
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
          <ErrorBanner message={wsState === "closed" ? "WebSocket disconnected — reconnecting may be required." : null} />

          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="me-select">Me</Label>
              {!useCustomMe ? (
                <NativeSelect
                  id="me-select"
                  value={characterNames.includes(me) ? me : ""}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (next === "__other__") {
                      setUseCustomMe(true);
                      return;
                    }
                    setMe(next);
                  }}
                  className="w-[240px]"
                >
                  {characterNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                  <option value="__other__">Other…</option>
                </NativeSelect>
              ) : (
                <div className="flex items-center gap-2">
                  <Input id="me-select" value={me} onChange={(e) => setMe(e.target.value)} className="w-[240px]" />
                  {characterNames.length > 0 ? (
                    <Button variant="outline" size="sm" onClick={() => setUseCustomMe(false)}>
                      Use list
                    </Button>
                  ) : null}
                </div>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="mode">Mode</Label>
              <NativeSelect id="mode" value={mode} onChange={(e) => setMode(e.target.value as any)} className="w-[220px]">
                <option value="practice">practice</option>
                <option value="learn">learn</option>
                <option value="read_through">read-through</option>
                <option value="speed_through">speed-through</option>
              </NativeSelect>
              <div className="text-xs text-muted-foreground max-w-[280px]">{modeHelp[mode]}</div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="from">From</Label>
              <Input
                id="from"
                type="number"
                value={fromIdx}
                onChange={(e) => setFromIdx(Number(e.target.value))}
                className={cn("w-[120px]", rangeInvalid && "border-destructive focus-visible:ring-destructive")}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="to">To</Label>
              <Input
                id="to"
                type="number"
                value={toIdx}
                onChange={(e) => setToIdx(Number(e.target.value))}
                className={cn("w-[120px]", rangeInvalid && "border-destructive focus-visible:ring-destructive")}
              />
            </div>
            <div className="text-xs text-muted-foreground">of {totalLines || "?"} total lines</div>
          </div>

          {rangeInvalid ? <div className="text-xs text-destructive">From must be less than or equal to To.</div> : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onStart} disabled={Boolean(startDisabledReason)} title={startDisabledReason ?? undefined}>
              Start + Play
            </Button>
            <Button
              variant="secondary"
              onClick={onPlay}
              disabled={!sessionId || sessionPlaying}
              title={!sessionId ? "Start a session first" : undefined}
            >
              Play
            </Button>
            <Button variant="outline" onClick={onStop} disabled={!sessionId} title={!sessionId ? "Start a session first" : undefined}>
              Stop
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={onRestartRange} disabled={!sessionId} title={!sessionId ? "Start a session first" : undefined}>
              Restart range
            </Button>
            <Button
              variant="outline"
              onClick={() => onReplayLast(10)}
              disabled={!sessionId || currentIdx === null}
              title={!sessionId ? "Start a session first" : currentIdx === null ? "Wait for playback position" : undefined}
            >
              Replay last 10
            </Button>
            {mode !== "speed_through" ? (
              <>
                <Button variant="outline" onClick={onSlower} disabled={!sessionId} title={!sessionId ? "Start a session first" : undefined}>
                  Slower
                </Button>
                <Button variant="outline" onClick={onFaster} disabled={!sessionId} title={!sessionId ? "Start a session first" : undefined}>
                  Faster
                </Button>
              </>
            ) : null}
            <div className="text-sm text-muted-foreground">
              Speed: <span className="font-mono">{speedMult.toFixed(2)}×</span>
            </div>
          </div>

          <Separator />

          <div className="rounded-md border p-3 space-y-2">
            <SessionBanner
              active={Boolean(sessionId)}
              label={sessionId ? `Session active • ${sessionPlaying ? "playing" : "ready"}` : "No active session"}
              rawId={sessionId}
              detail={currentIdx !== null ? `Current idx: ${currentIdx}` : null}
              className="p-0 border-0"
            />
            <div className="text-sm text-muted-foreground">Progress: {progressUnits} / {totalInRange} lines</div>
            <div className="h-2 w-full rounded bg-muted/40 overflow-hidden">
              <div className="h-full bg-primary/70 transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          <div className="rounded-md border p-2 text-xs text-muted-foreground">Characters: {characterSummary}</div>

          <ScrollArea className="h-[260px] rounded-md border bg-muted/20">
            <div className="p-2 text-sm">
              {timeline.length === 0 ? (
                <div className="p-2 text-sm text-muted-foreground">
                  Configure your character and range above, then press <b>Start + Play</b>.
                </div>
              ) : (
                timeline.map((t) => {
                  const active = currentIdx === t.idx;
                  const rowClass = cn(
                    "rounded-md px-2 py-1 cursor-pointer",
                    active && "bg-accent",
                    t.kind === "pause" && "bg-amber-50/50 border-l-2 border-amber-500 dark:bg-amber-900/20",
                  );
                  const showText = t.revealed && t.text;
                  if (t.kind === "direction") {
                    return (
                      <div key={t.key} className={rowClass} onClick={() => onJumpToIdxAndReplay(t.idx)}>
                        <span className="mr-2 font-mono text-xs text-muted-foreground">{t.idx}</span>
                        <span className="font-mono text-xs">[DIR] {t.text}</span>
                      </div>
                    );
                  }
                  if (t.kind === "pause") {
                    return (
                      <div key={t.key} className={rowClass} onClick={() => onJumpToIdxAndReplay(t.idx)}>
                        <span className="mr-2 font-mono text-xs text-muted-foreground">{t.idx}</span>
                        <b>{me}</b>: <span className="text-muted-foreground">(your turn)</span>{" "}
                        {t.cue ? <span className="text-muted-foreground">cue: “{t.cue} …”</span> : null}
                      </div>
                    );
                  }
                  if (t.kind === "gap") {
                    return (
                      <div key={t.key} className={rowClass} onClick={() => onJumpToIdxAndReplay(t.idx)}>
                        <span className="mr-2 font-mono text-xs text-muted-foreground">{t.idx}</span>
                        <b>{t.speaker ?? "?"}</b>: {showText ? <span>{t.text}</span> : <span className="text-muted-foreground">(waiting…)</span>}
                      </div>
                    );
                  }
                  return (
                    <div key={t.key} className={rowClass} onClick={() => onJumpToIdxAndReplay(t.idx)}>
                      <span className="mr-2 font-mono text-xs text-muted-foreground">{t.idx}</span>
                      <b>{t.speaker ?? "?"}</b>: {showText ? <span>{t.text}</span> : <span className="text-muted-foreground">(hidden)</span>}
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
                <p>Your browser blocked autoplay. Click enable audio to continue.</p>
                <Button variant="secondary" onClick={onEnableAudio}>
                  Enable audio
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {audioErrorIdx !== null ? (
            <Alert>
              <AlertTitle>Audio failed</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Line <span className="font-mono">{audioErrorIdx}</span> failed to load or decode.
                </span>
                <Button variant="secondary" onClick={onRetryErroredLine} disabled={!sessionId}>
                  Retry this line
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          <audio ref={audioRef} controls className="w-full" />

          <Accordion type="single" collapsible>
            <AccordionItem value="advanced">
              <AccordionTrigger>Advanced</AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Switch checked={readAll} onCheckedChange={(v) => setReadAll(Boolean(v))} />
                      <span className="text-sm">Read all</span>
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Pause mult</Label>
                      <Input type="number" step="0.05" value={pauseMult} onChange={(e) => setPauseMult(Number(e.target.value))} className="w-[140px]" />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Cue words</Label>
                      <Input type="number" value={cueWords} onChange={(e) => setCueWords(Number(e.target.value))} className="w-[140px]" />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Seek idx</Label>
                      <Input type="number" value={seekIdx} onChange={(e) => setSeekIdx(Number(e.target.value))} className="w-[140px]" />
                    </div>
                    <Button variant="outline" onClick={onSeek} disabled={!sessionId}>
                      Seek
                    </Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="debug">
              <AccordionTrigger>Debug</AccordionTrigger>
              <AccordionContent>
                <div>
                  <div className="text-sm font-medium">Full lines</div>
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
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
