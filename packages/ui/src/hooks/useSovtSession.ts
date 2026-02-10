import React from "react";

import { callAction } from "@/api/client";
import type { BreakMenu, SovtCmdStep } from "@/app/types";

function prettyJson(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
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

export function useSovtSession() {
  const [sovtCard, setSovtCard] = React.useState<any | null>(null);
  const [sovtEventKey, setSovtEventKey] = React.useState<string | null>(null);
  const [sovtSteps, setSovtSteps] = React.useState<SovtCmdStep[]>([]);
  const [sovtError, setSovtError] = React.useState<string | null>(null);
  const [sovtCompletion, setSovtCompletion] = React.useState<any | null>(null);

  function loadSovtFromCard(eventKey: string | null, card: any) {
    setSovtError(null);
    setSovtCompletion(null);
    setSovtCard(card ?? null);
    setSovtEventKey(eventKey);
    const prompt = String(card?.prompt ?? "");
    setSovtSteps(parseSovtCmdSteps(prompt));
  }

  async function chooseBreakLaneAndStartSovt(args: {
    breakMenu: BreakMenu | null;
    chooseBreakLane: (lane: string) => Promise<any | null>;
    onSwitchToSovtTab: () => void;
  }) {
    setSovtError(null);
    setSovtCompletion(null);
    const { breakMenu, chooseBreakLane, onSwitchToSovtTab } = args;
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
    onSwitchToSovtTab();
  }

  async function runSovtCmd(stepIdx: number) {
    const step = sovtSteps.find((s) => s.idx === stepIdx) ?? null;
    if (!step) return;
    setSovtError(null);

    setSovtSteps((prev) =>
      prev.map((s) => (s.idx === stepIdx ? { ...s, status: "running", started_at_ms: Date.now(), ended_at_ms: null, error: null } : s)),
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
      setSovtSteps((prev) => prev.map((s) => (s.idx === stepIdx ? { ...s, status: "error", ended_at_ms: Date.now(), error: msg } : s)));
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

  return {
    sovtCard,
    sovtEventKey,
    sovtSteps,
    sovtError,
    sovtCompletion,

    loadSovtFromCard,
    chooseBreakLaneAndStartSovt,
    runSovtCmd,
    completeSovt,
  };
}

