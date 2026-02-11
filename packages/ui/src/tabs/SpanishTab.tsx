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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { NativeSelect } from "@/components/NativeSelect";
import { RecordingControls } from "@/components/RecordingControls";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SessionBanner } from "@/components/SessionBanner";
import { ActivityDot } from "@/components/ActivityDot";
import { prettyJson } from "@/lib/format";
import { cn } from "@/lib/utils";

function humanSessionLabel(args: {
  sessionId: string | null;
  lane: string | null;
  source: "break_choice" | "srs_due" | null;
  brainDefault: BrainDefault;
}): string {
  if (!args.sessionId) return "No active session";
  const lane = args.lane ?? "spanish";
  const source = args.source === "srs_due" ? "Due review" : "Break choice";
  return `${lane} session (${args.brainDefault}) • ${source}`;
}

export function SpanishTab(props: {
  spanishBrainDefault: BrainDefault;
  setSpanishBrainSetting: (brain: BrainDefault) => void;
  spanishSessionId: string | null;
  spanishSessionLane: string | null;
  spanishSessionSource: "break_choice" | "srs_due" | null;
  spanishBrain: SpanishBrain | null;
  spanishLoading: boolean;
  spanishError: string | null;
  clearSpanishError: () => void;
  spanishMessages: SpanishMessage[];
  spanishChatEndRef: React.RefObject<HTMLDivElement>;
  spanishSrsDueCounts: { verb: number; noun: number; lesson: number } | null;

  canStartFromBreakChoice: boolean;
  onGoToBreakTab: () => void;
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
    spanishSessionLane,
    spanishSessionSource,
    spanishBrain,
    spanishLoading,
    spanishError,
    clearSpanishError,
    spanishMessages,
    spanishChatEndRef,
    spanishSrsDueCounts,
    canStartFromBreakChoice,
    onGoToBreakTab,
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
  const [pendingEndStatus, setPendingEndStatus] = React.useState<"completed" | "abandoned" | null>(null);

  const hasDueCounts = spanishSrsDueCounts !== null;
  const dueNow = spanishSrsDueCounts ?? { verb: 0, noun: 0, lesson: 0 };
  const dueForLane = hasDueCounts ? Number((dueNow as any)[dueLane] ?? 0) || 0 : 0;

  const awaitingUser = Boolean(spanishSessionId && spanishBrain?.await === "user");
  const answerDisabled = !spanishSessionId || !awaitingUser || spanishLoading;
  const answerPlaceholder = !spanishSessionId
    ? "Start a session first."
    : awaitingUser
      ? "Type your answer..."
      : "Waiting for tutor response...";

  const sessionLabel = humanSessionLabel({
    sessionId: spanishSessionId,
    lane: spanishSessionLane,
    source: spanishSessionSource,
    brainDefault: spanishBrainDefault,
  });

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
              Brain
            </Label>
            <NativeSelect
              id="sp-brain"
              value={spanishBrainDefault}
              onChange={(e) => setSpanishBrainSetting(e.target.value as BrainDefault)}
              disabled={Boolean(spanishSessionId)}
              className="w-[150px]"
            >
              <option value="codex">Codex</option>
              <option value="claude">Claude</option>
            </NativeSelect>
            {spanishSessionId ? <span className="text-xs text-muted-foreground">(locked while active)</span> : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-md border p-3 space-y-3">
          <div className="text-sm font-medium">Start a session</div>

          <div className="rounded-md border p-3 space-y-2">
            <div className="text-sm font-medium">Review due cards</div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid gap-1">
                <Label htmlFor="sp-due-lane" className="text-xs text-muted-foreground">
                  Due lane
                </Label>
                <NativeSelect
                  id="sp-due-lane"
                  value={dueLane}
                  onChange={(e) => setDueLane(e.target.value as any)}
                  disabled={spanishLoading || Boolean(spanishSessionId)}
                  className="w-[220px]"
                >
                  <option value="verb">verb ({hasDueCounts ? dueNow.verb : "?"} due)</option>
                  <option value="noun">noun ({hasDueCounts ? dueNow.noun : "?"} due)</option>
                  <option value="lesson">lesson ({hasDueCounts ? dueNow.lesson : "?"} due)</option>
                </NativeSelect>
              </div>
              <Button
                variant="secondary"
                onClick={() => startSpanishDueSession(dueLane)}
                disabled={spanishLoading || Boolean(spanishSessionId) || (hasDueCounts && dueForLane <= 0)}
              >
                Review due now
              </Button>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">or</div>

          <div className="rounded-md border p-3 space-y-2">
            <div className="text-sm font-medium">Start from Break choice</div>
            <div className="text-xs text-muted-foreground">Choose a Spanish lane in the Break tab first.</div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={startSpanishSessionFromChoice}
                disabled={spanishLoading || Boolean(spanishSessionId) || !canStartFromBreakChoice}
                title={!canStartFromBreakChoice ? "Load a break menu and choose a Spanish lane first." : undefined}
              >
                Start from break choice
              </Button>
              {!canStartFromBreakChoice ? (
                <Button variant="ghost" size="sm" onClick={onGoToBreakTab}>
                  Go to Break tab
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <SessionBanner
          active={Boolean(spanishSessionId)}
          label={sessionLabel}
          rawId={spanishSessionId}
          actions={
            <>
              <Button variant="secondary" onClick={() => setPendingEndStatus("completed")} disabled={!spanishSessionId}>
                Complete
              </Button>
              <Button variant="outline" onClick={() => setPendingEndStatus("abandoned")} disabled={!spanishSessionId}>
                Abandon
              </Button>
            </>
          }
        />

        <ErrorBanner message={spanishError} onDismiss={clearSpanishError} />

        <div className="rounded-md border bg-muted/20">
          <div className="border-b px-3 py-2 text-sm font-medium">Chat</div>
          <ScrollArea className="min-h-[340px] max-h-[60vh]">
            <div className="p-3 space-y-3 text-sm">
              {spanishMessages.length === 0 ? (
                <div className="text-sm text-muted-foreground">Start a session to begin tutoring.</div>
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
                      <div className="text-xs font-medium text-muted-foreground mb-1">{msg.role === "tutor" ? "Tutor" : "You"}</div>
                    ) : null}
                    <pre className="whitespace-pre-wrap text-sm font-sans">{msg.text}</pre>
                  </div>
                ))
              )}

              {spanishLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ActivityDot />
                  Thinking...
                </div>
              ) : null}
              <div ref={spanishChatEndRef} />
            </div>
          </ScrollArea>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[280px]">
            <Label htmlFor="sp-answer">Your answer</Label>
            <Input
              id="sp-answer"
              value={spanishAnswer}
              onChange={(e) => setSpanishAnswer(e.target.value)}
              placeholder={answerPlaceholder}
              disabled={answerDisabled}
              onKeyDown={(e) => {
                if ((e.nativeEvent as any)?.isComposing) return;
                if (e.key === "Enter" && !e.shiftKey && spanishAnswer.trim() && !answerDisabled) {
                  e.preventDefault();
                  submitSpanishAnswer();
                }
              }}
            />
          </div>
          <Button onClick={submitSpanishAnswer} disabled={answerDisabled || !spanishAnswer.trim()}>
            Submit
          </Button>
        </div>

        {spanishPendingListen ? (
          <Alert>
            <AlertTitle>Pronunciation check</AlertTitle>
            <AlertDescription className="space-y-2">
              <div>
                Say: <span className="font-mono">{spanishPendingListen.target_text}</span>
              </div>
              <RecordingControls
                isRecording={spanishRecording}
                elapsedMs={spanishRecordingElapsedMs}
                onStart={startSpanishRecording}
                onStop={uploadSpanishListenAttempt}
                disabled={spanishLoading}
                stopLabelPrefix="Stop + Upload"
                hint="Record for about 3-5 seconds, then stop and upload."
              />
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={toggleSpanishAudioMuted}>
            {spanishAudioMuted ? "Unmute auto-play" : "Mute auto-play"}
          </Button>
          {spanishAudioQueueLen > 0 ? (
            <span className="text-xs text-muted-foreground">
              Playing audio... ({Math.max(0, spanishAudioQueueLen - 1)} more)
            </span>
          ) : null}
        </div>

        {spanishAudioNeedsGesture ? (
          <Alert>
            <AlertTitle>Audio needs a click</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>Your browser blocked autoplay. Click enable audio to continue.</p>
              <Button variant="secondary" size="sm" onClick={enableSpanishAudio}>
                Enable audio
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <audio ref={spanishAudioRef} controls className="w-full" />

        <Accordion type="single" collapsible>
          <AccordionItem value="sessions">
            <AccordionTrigger>Sessions</AccordionTrigger>
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
                    Load current transcript
                  </Button>
                  {spanishTranscriptSessionId ? (
                    <span className="text-sm text-muted-foreground" title={spanishTranscriptSessionId}>
                      viewing transcript
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
                  <div className="text-sm text-muted-foreground">No sessions loaded yet. Click refresh sessions.</div>
                ) : (
                  <div className="rounded-md border">
                    <div className="border-b px-3 py-2 text-sm font-medium">Recent sessions</div>
                    <ScrollArea className="h-[160px]">
                      <div className="p-2 text-sm space-y-2">
                        {spanishSessions.map((s) => (
                          <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                            <div>
                              <div className="text-xs text-muted-foreground" title={s.id}>
                                {s.lane ?? "spanish"} • {s.status} • {s.brain_name ?? "codex"}
                              </div>
                              <div className="text-xs text-muted-foreground">{new Date(s.updated_at).toLocaleString()}</div>
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
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No transcript loaded yet.</div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="debug">
            <AccordionTrigger>Debug</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3 text-sm">
                {spanishSpeakResults.length > 0 ? (
                  <div className="rounded-md border p-2 space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">Recent TTS audio</div>
                    {spanishSpeakResults.map((r) => (
                      <div key={`${r.id}-${r.audio_id}`} className="flex items-center justify-between gap-2 rounded-md border p-2">
                        <div className="font-mono text-xs">{r.audio_id}</div>
                        <a className="text-xs text-primary underline" href={r.url} target="_blank" rel="noreferrer">
                          open
                        </a>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No audio debug items yet.</div>
                )}

                {spanishTranscriptTurns.length > 0 ? (
                  <div className="rounded-md border p-2">
                    <div className="text-xs font-medium text-muted-foreground mb-2">Transcript raw JSON</div>
                    <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap rounded-md bg-muted/30 p-2 text-xs">
                      {prettyJson(JSON.stringify(spanishTranscriptTurns))}
                    </pre>
                  </div>
                ) : null}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>

      <Dialog open={pendingEndStatus !== null} onOpenChange={(open) => !open && setPendingEndStatus(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingEndStatus === "completed" ? "Complete this session?" : "Abandon this session?"}</DialogTitle>
            <DialogDescription>
              {pendingEndStatus === "completed"
                ? "This marks the current session as completed."
                : "This ends the session and marks it as abandoned. Progress remains saved."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingEndStatus(null)}>
              Cancel
            </Button>
            <Button
              variant={pendingEndStatus === "completed" ? "secondary" : "destructive"}
              onClick={() => {
                if (pendingEndStatus) endSpanishSession(pendingEndStatus);
                setPendingEndStatus(null);
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
