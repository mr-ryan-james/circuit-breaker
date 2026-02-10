import React from "react";

import type { CharacterRow, LineRow, ScriptRow, TimelineItem } from "@/app/types";
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
                    <TableRow key={s.id} className="cursor-pointer" onClick={() => onLoadScript(s.id)}>
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

            <Button onClick={onStart} disabled={!selectedScriptId || wsState !== "open"}>
              Start + Play
            </Button>
            <Button variant="secondary" onClick={onPlay} disabled={!sessionId || sessionPlaying}>
              Play
            </Button>
            <Button variant="outline" onClick={onStop} disabled={!sessionId}>
              Stop
            </Button>
            <Button variant="outline" onClick={onRestartRange} disabled={!sessionId}>
              Restart range
            </Button>
            <Button variant="outline" onClick={() => onReplayLast(10)} disabled={!sessionId || currentIdx === null}>
              Replay last 10
            </Button>

            {mode !== "speed_through" ? (
              <>
                <Button variant="outline" onClick={onSlower} disabled={!sessionId}>
                  Slower
                </Button>
                <Button variant="outline" onClick={onFaster} disabled={!sessionId}>
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
            Session: <span className="font-mono">{sessionId ?? "(none)"}</span> • {sessionPlaying ? "playing" : "ready"} • Current
            idx: <span className="font-mono">{currentIdx ?? "(n/a)"}</span>
          </div>

          <ScrollArea className="h-[260px] rounded-md border bg-muted/20">
            <div className="p-2 text-sm">
              {timeline.length === 0 ? (
                <div className="p-2 text-muted-foreground">
                  Press <b>Start + Play</b>.
                </div>
              ) : (
                timeline.map((t) => {
                  const active = currentIdx === t.idx;
                  const rowClass = cn("rounded-md px-2 py-1 cursor-pointer", active && "bg-accent");
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
                        <b>{t.speaker ?? "?"}</b>:{" "}
                        {showText ? <span>{t.text}</span> : <span className="text-muted-foreground">(waiting…)</span>}
                      </div>
                    );
                  }
                  return (
                    <div key={t.key} className={rowClass} onClick={() => onJumpToIdxAndReplay(t.idx)}>
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
                    <Button variant="outline" onClick={onSeek} disabled={!sessionId}>
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
  );
}
