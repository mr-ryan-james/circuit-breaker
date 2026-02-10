import React from "react";

import type { BreakMenu } from "@/app/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

export function BreakTab(props: {
  breakSite: string;
  setBreakSite: (v: string) => void;
  breakMinutes: number;
  setBreakMinutes: (v: number) => void;
  breakContext: string;
  setBreakContext: (v: string) => void;
  autoStartActing: boolean;
  setAutoStartActing: (v: boolean) => void;
  breakMenu: BreakMenu | null;
  breakChoice: any | null;
  spanishSrsDueCounts: { verb: number; noun: number; lesson: number } | null;
  loadBreakMenu: () => void;
  unblockAllFromUi: (minutes: number) => void;
  chooseBreakLane: (lane: string) => void;
  chooseBreakLaneAndStartSpanish: (lane: "verb" | "noun" | "lesson" | "fusion") => void;
  chooseBreakLaneAndStartSovt: () => void;
  spanishLoading: boolean;
  spanishSessionId: string | null;

  actingPickerOpen: boolean;
  actingPickerScripts: any[] | null;
  actingPickerLoadingId: number | null;
  setActingPickerOpen: (v: boolean) => void;
  setActingPickerLoadingId: (v: number | null) => void;
  loadAndMaybeStart: (scriptId: number, start: boolean) => Promise<void>;
  switchToActingTab: () => void;

  copyToClipboard: (text: string) => Promise<void>;
  sendChoiceToAgent: (choice: any) => Promise<void>;
}) {
  const {
    breakSite,
    setBreakSite,
    breakMinutes,
    setBreakMinutes,
    breakContext,
    setBreakContext,
    autoStartActing,
    setAutoStartActing,
    breakMenu,
    breakChoice,
    spanishSrsDueCounts,
    loadBreakMenu,
    unblockAllFromUi,
    chooseBreakLane,
    chooseBreakLaneAndStartSpanish,
    chooseBreakLaneAndStartSovt,
    spanishLoading,
    spanishSessionId,
    actingPickerOpen,
    actingPickerScripts,
    actingPickerLoadingId,
    setActingPickerOpen,
    setActingPickerLoadingId,
    loadAndMaybeStart,
    switchToActingTab,
    copyToClipboard,
    sendChoiceToAgent,
  } = props;

  return (
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
                const isActingLane = laneType === "acting";
                const dueCount =
                  laneType === "verb" || laneType === "noun" || laneType === "lesson"
                    ? Number((spanishSrsDueCounts as any)?.[laneType] ?? 0) || 0
                    : 0;

                return (
                  <Card key={`${breakMenu.event_key}-${l.type}-${card?.id ?? "x"}`}>
                    <CardHeader>
                      <CardTitle className="text-base">
                        {laneType}
                        {dueCount > 0 ? <span className="text-muted-foreground"> ({dueCount} due)</span> : null}
                      </CardTitle>
                      <CardDescription>
                        {card?.activity ?? "(missing card)"} • {card?.minutes ?? "?"} min •{" "}
                        {card?.doneCondition ?? card?.done_condition ?? ""}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button onClick={() => chooseBreakLane(l.type)}>
                          {isSpanishLane
                            ? "Choose (Spanish)"
                            : isSovtLane
                              ? "Choose (SOVT)"
                              : isActingLane
                                ? "Choose (acting)"
                                : "Choose"}
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
                                                switchToActingTab();
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
                                                switchToActingTab();
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
  );
}
