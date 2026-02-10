import React from "react";

import type {
  BrainDefault,
  SpanishBrain,
  SpanishMessage,
  SpanishPendingListen,
  SpanishSessionRow,
  SpanishSpeakResult,
  SpanishTurnRow,
} from "@/app/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

function formatMmSs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function prettyJson(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function SpanishTab(props: {
  spanishBrainDefault: BrainDefault;
  setSpanishBrainSetting: (brain: BrainDefault) => void;
  spanishSessionId: string | null;
  spanishBrain: SpanishBrain | null;
  spanishLoading: boolean;
  spanishError: string | null;
  spanishMessages: SpanishMessage[];
  spanishChatEndRef: React.RefObject<HTMLDivElement>;
  spanishSrsDueCounts: { verb: number; noun: number; lesson: number } | null;

  startSpanishSessionFromChoice: () => void;
  startSpanishDueSession: (lane: "verb" | "noun" | "lesson") => void;
  endSpanishSession: (status: "completed" | "abandoned") => void;

  spanishAnswer: string;
  setSpanishAnswer: (v: string) => void;
  submitSpanishAnswer: () => void;

  spanishPendingListen: SpanishPendingListen | null;
  spanishRecording: boolean;
  spanishRecordingElapsedMs: number;
  startSpanishRecording: () => void;
  uploadSpanishListenAttempt: () => void;

  spanishSpeakResults: SpanishSpeakResult[];
  spanishAudioQueueLen: number;
  spanishAudioMuted: boolean;
  toggleSpanishAudioMuted: () => void;
  spanishAudioNeedsGesture: boolean;
  enableSpanishAudio: () => void;
  spanishAudioRef: React.RefObject<HTMLAudioElement>;

  refreshSpanishSessions: () => void;
  loadSpanishTranscript: (sessionId: string) => void;
  spanishSessions: SpanishSessionRow[];
  spanishTranscriptSessionId: string | null;
  spanishTranscriptTurns: SpanishTurnRow[];
  spanishTranscriptError: string | null;
}) {
  const {
    spanishBrainDefault,
    setSpanishBrainSetting,
    spanishSessionId,
    spanishBrain,
    spanishLoading,
    spanishError,
    spanishMessages,
    spanishChatEndRef,
    spanishSrsDueCounts,
    startSpanishSessionFromChoice,
    startSpanishDueSession,
    endSpanishSession,
    spanishAnswer,
    setSpanishAnswer,
    submitSpanishAnswer,
    spanishPendingListen,
    spanishRecording,
    spanishRecordingElapsedMs,
    startSpanishRecording,
    uploadSpanishListenAttempt,
    spanishSpeakResults,
    spanishAudioQueueLen,
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
  } = props;

  const [dueLane, setDueLane] = React.useState<"verb" | "noun" | "lesson">("verb");
  const hasDueCounts = spanishSrsDueCounts !== null;
  const dueNow = spanishSrsDueCounts ?? { verb: 0, noun: 0, lesson: 0 };
  const dueForLane = hasDueCounts ? Number((dueNow as any)[dueLane] ?? 0) || 0 : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Spanish</CardTitle>
            <CardDescription>AI-driven Spanish tutoring sessions.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="sp-brain" className="text-sm">
              Brain:
            </Label>
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
            {spanishSessionId ? <span className="text-xs text-muted-foreground">(locked for session)</span> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={startSpanishSessionFromChoice} disabled={spanishLoading}>
            Start Spanish Session (from last break choice)
          </Button>
          <div className="flex flex-wrap items-end gap-2 rounded-md border px-3 py-2">
            <div className="grid gap-1">
              <Label htmlFor="sp-due-lane" className="text-xs text-muted-foreground">
                Due lane
              </Label>
              <select
                id="sp-due-lane"
                value={dueLane}
                onChange={(e) => setDueLane(e.target.value as any)}
                disabled={spanishLoading || Boolean(spanishSessionId)}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <option value="verb">verb ({hasDueCounts ? dueNow.verb : "?"} due)</option>
                <option value="noun">noun ({hasDueCounts ? dueNow.noun : "?"} due)</option>
                <option value="lesson">lesson ({hasDueCounts ? dueNow.lesson : "?"} due)</option>
              </select>
            </div>
            <Button
              variant="secondary"
              onClick={() => startSpanishDueSession(dueLane)}
              disabled={spanishLoading || Boolean(spanishSessionId) || (hasDueCounts && (dueForLane ?? 0) <= 0)}
            >
              Review due now
            </Button>
          </div>
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
                  if ((e.nativeEvent as any)?.isComposing) return;
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
                <Button onClick={startSpanishRecording} disabled={spanishLoading}>
                  Record
                </Button>
              ) : (
                <Button onClick={uploadSpanishListenAttempt}>Stop + Upload ({formatMmSs(spanishRecordingElapsedMs)})</Button>
              )}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={toggleSpanishAudioMuted}>
            {spanishAudioMuted ? "Unmute auto-play" : "Mute auto-play"}
          </Button>
          {spanishAudioNeedsGesture ? (
            <Button variant="secondary" size="sm" onClick={enableSpanishAudio}>
              Enable audio
            </Button>
          ) : null}
          {spanishAudioQueueLen > 0 ? (
            <span className="text-xs text-muted-foreground">Audio queue: {spanishAudioQueueLen}</span>
          ) : null}
        </div>
        <audio ref={spanishAudioRef} controls className="w-full" />

        <Accordion type="single" collapsible>
          {spanishSpeakResults.length > 0 ? (
            <AccordionItem value="audio">
              <AccordionTrigger>Audio (debug)</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm">
                  {spanishSpeakResults.map((r) => (
                    <div key={`${r.id}-${r.audio_id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                      <div className="font-mono text-xs">{r.audio_id}</div>
                      <a className="text-xs text-primary underline" href={r.url} target="_blank" rel="noreferrer">
                        open
                      </a>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ) : null}

          <AccordionItem value="transcript">
            <AccordionTrigger>Transcript / Sessions (debug)</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
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
                    <div className="border-b px-3 py-2 text-sm font-medium">Turns ({spanishTranscriptTurns.length})</div>
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
                              <pre className="mt-2 whitespace-pre-wrap rounded-md bg-muted/30 p-2 text-xs">{prettyJson(t.json)}</pre>
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
  );
}
