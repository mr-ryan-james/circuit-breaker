import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Hono } from "hono";
import { z } from "zod";

import {
  buildBreakMenu,
  getBreakServedEvent,
  getSetting,
  getSiteBySlug,
  insertEvent,
} from "@circuit-breaker/core";

import { defaultStateDir, writeState } from "./state.js";
import { openActingDb } from "./actingDb.js";
import { openCoreDb } from "./coreDb.js";
import { estimatedSpeakSeconds, sanitizeTtsText, TTS_SANITIZER_VERSION } from "./sanitize.js";
import { renderTts, resolveTtsCacheDir } from "./tts.js";
import { runCodex } from "./codexRunner.js";
import { analyzeListenAttempt } from "./listenServer.js";
import {
  getSpanishSession,
  insertSpanishSession,
  insertSpanishTurn,
  listSpanishTurns,
  listSpanishSessions,
  makeSpanishId,
  nextSpanishTurnIdx,
  updateSpanishSession,
} from "./spanishDb.js";

type AgentSignal = {
  id: string;
  name: string;
  payload: unknown;
  created_at: string;
};

type WsClient = {
  send: (data: string) => void;
  close: () => void;
};

type RunLinesSession = {
  id: string;
  script_id: number;
  from: number;
  to: number;
  mode: "read_through" | "practice" | "speed_through";
  me_norm: string;
  read_all: boolean;
  pause_mult: number;
  pause_min_sec: number;
  pause_max_sec: number;
  cue_words: number;
  reveal_after: boolean;
  speed_mult: number;
  playing: boolean;
  pending_self_line: null | {
    idx: number;
    speaker: string | null;
    text: string;
    audio_id: string;
    duration_sec: number;
  };
  event_seq: number;
  idx: number;
  lines: Array<{
    idx: number;
    type: string;
    speaker_normalized: string | null;
    text: string;
  }>;
  characters: Array<{
    normalized_name: string;
    voice: string;
    rate: string;
  }>;
};

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function parseArgs(argv: string[]): { port?: number; stateDir: string; dev: boolean } {
  let port: number | undefined;
  let stateDir = defaultStateDir();
  let dev = false;

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--port" && next && /^\d+$/.test(next)) {
      port = Number(next);
      i += 1;
      continue;
    }
    if (a === "--state-dir" && next) {
      stateDir = path.resolve(next);
      i += 1;
      continue;
    }
    if (a === "--dev") {
      dev = true;
      continue;
    }
  }

  return { port, stateDir, dev };
}

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function repoRootFromHere(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../../");
}

function siteTogglePath(): string {
  return path.join(repoRootFromHere(), "site-toggle");
}

function runSiteToggleWithSudo(args: string[]): { ok: true; result: any } | { ok: false; error: string; details?: any } {
  const st = siteTogglePath();
  const proc = Bun.spawnSync(["sudo", "-n", st, ...args], { cwd: repoRootFromHere(), stdout: "pipe", stderr: "pipe" });
  const stdout = new TextDecoder().decode(proc.stdout ?? new Uint8Array());
  const stderr = new TextDecoder().decode(proc.stderr ?? new Uint8Array());

  if (proc.exitCode !== 0) {
    return {
      ok: false,
      error: "sudo_failed",
      details: {
        exit_code: proc.exitCode,
        stdout: stdout.slice(0, 2000),
        stderr: stderr.slice(0, 2000),
      },
    };
  }

  try {
    return { ok: true, result: JSON.parse(stdout) };
  } catch {
    return {
      ok: false,
      error: "sudo_bad_json",
      details: { stdout: stdout.slice(0, 2000), stderr: stderr.slice(0, 2000) },
    };
  }
}

function normalizeMeName(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ActionEnvelopeV1 = z.object({
  v: z.literal(1),
  action: z.string().min(1),
  payload: z.unknown(),
});

const SpanishVoiceSchema = z.enum(["es-ES-AlvaroNeural", "es-ES-ElviraNeural", "es-MX-JorgeNeural", "es-MX-DaliaNeural"]);

const SpanishToolRequestSchema = z.discriminatedUnion("tool", [
  z.object({
    id: z.string().min(1),
    tool: z.literal("speak"),
    args: z.object({
      text: z.string().min(1).max(400),
      voice: SpanishVoiceSchema,
      rate: z.string().regex(/^[+-]?\d+%$/),
    }),
  }),
  z.object({
    id: z.string().min(1),
    tool: z.literal("listen"),
    args: z.object({
      target_text: z.string().min(1).max(400),
    }),
  }),
]);

const SpanishBrainOutputSchema = z.object({
  v: z.literal(1),
  assistant_text: z.string().min(1).max(12_000),
  tool_requests: z.array(SpanishToolRequestSchema).max(8),
  await: z.enum(["user", "listen_result", "done"]),
});
type SpanishBrainOutput = z.infer<typeof SpanishBrainOutputSchema>;

function safeJsonParse(input: string): any | null {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

type RecentActingScript = {
  id: number;
  title: string;
  source_format: string;
  created_at: string;
  last_practiced_at: string | null;
  character_count: number;
  dialogue_lines: number;
  character_names: string[];
};

function loadRecentActingScripts(limit: number): RecentActingScript[] {
  try {
    const { db: actingDb } = openActingDb();
    const rows = actingDb
      .prepare(
        `
        WITH last_practice AS (
          SELECT script_id, MAX(created_at) AS last_practiced_at
          FROM script_practice_events
          GROUP BY script_id
        )
        SELECT
          s.id,
          s.title,
          s.source_format,
          s.created_at,
          lp.last_practiced_at,
          (SELECT COUNT(*) FROM script_characters c WHERE c.script_id = s.id) AS character_count,
          (SELECT COUNT(*) FROM script_lines l WHERE l.script_id = s.id AND l.type = 'dialogue') AS dialogue_lines
        FROM scripts s
        LEFT JOIN last_practice lp ON lp.script_id = s.id
        ORDER BY COALESCE(lp.last_practiced_at, s.created_at) DESC, s.id DESC
        LIMIT ?
      `,
      )
      .all(limit) as Array<{
      id: number;
      title: string;
      source_format: string;
      created_at: string;
      last_practiced_at: string | null;
      character_count: number;
      dialogue_lines: number;
    }>;

    const nameStmt = actingDb.prepare("SELECT name FROM script_characters WHERE script_id = ? ORDER BY name");
    const enriched = rows.map((r) => {
      const nameRows = nameStmt.all(r.id) as Array<{ name: string }>;
      const names = nameRows.map((nr) => nr.name).filter(Boolean);
      return { ...r, character_names: names };
    });

    actingDb.close();
    return enriched;
  } catch {
    return [];
  }
}

export async function main(): Promise<void> {
  const { port: desiredPort, stateDir, dev } = parseArgs(process.argv.slice(2));

  const token = crypto.randomBytes(16).toString("hex");
  const startedAt = new Date().toISOString();
  const logPath = path.join(stateDir, "server.log");
  const sudoCheck = runSiteToggleWithSudo(["status", "--json"]);
  const sudoSiteToggleOk = sudoCheck.ok && Boolean(sudoCheck.result?.ok);

  const signals: AgentSignal[] = [];
  const wsClients = new Set<any>();
  const sessions = new Map<string, RunLinesSession>();
  const spanishBusy = new Set<string>();

  function wsBroadcast(msg: any): void {
    const data = JSON.stringify(msg);
    for (const ws of wsClients) {
      try {
        ws.send(data);
      } catch {
        // ignore
      }
    }
  }

  const actionHandlers: Record<
    string,
    {
      description: string;
      schema: z.ZodTypeAny;
      handler: (payload: any) => Promise<any>;
    }
  > = {
    "agent.signal": {
      description: "Send a signal from an agent/CLI to the UI.",
      schema: z.object({ name: z.string().min(1), payload: z.unknown().optional() }),
      async handler(payload) {
        const sig: AgentSignal = {
          id: makeId("sig"),
          name: payload.name,
          payload: payload.payload ?? null,
          created_at: new Date().toISOString(),
        };
        signals.push(sig);
        while (signals.length > 200) signals.shift();
        for (const ws of wsClients) {
          try {
            ws.send(JSON.stringify({ type: "agent.signal", ...sig }));
          } catch {
            // ignore
          }
        }
        return { ok: true, signal: sig };
      },
    },
    "acting.scripts.list": {
      description: "List imported acting scripts (most recent first).",
      schema: z.object({ limit: z.number().int().min(1).max(50).optional() }),
      async handler(payload) {
        const { db } = openActingDb();
        try {
          const limit = payload.limit ?? 10;
          const rows = db
            .prepare("SELECT id, title, source_format, created_at FROM scripts ORDER BY id DESC LIMIT ?")
            .all(limit) as Array<{ id: number; title: string; source_format: string; created_at: string }>;
          return { ok: true, scripts: rows };
        } finally {
          db.close();
        }
      },
    },
    "acting.script.characters": {
      description: "List characters and their voices for a script.",
      schema: z.object({ script_id: z.number().int().positive() }),
      async handler(payload) {
        const { db } = openActingDb();
        try {
          const rows = db
            .prepare(
              "SELECT normalized_name, name, voice, rate FROM script_characters WHERE script_id = ? ORDER BY normalized_name",
            )
            .all(payload.script_id) as Array<{ normalized_name: string; name: string; voice: string; rate: string }>;
          return { ok: true, characters: rows };
        } finally {
          db.close();
        }
      },
    },
    "acting.script.lines": {
      description: "Fetch script lines for display.",
      schema: z.object({
        script_id: z.number().int().positive(),
        from: z.number().int().nonnegative().optional(),
        to: z.number().int().nonnegative().optional(),
      }),
      async handler(payload) {
        const { db } = openActingDb();
        try {
          const from = payload.from ?? 0;
          const to = payload.to ?? 1_000_000;
          const rows = db
            .prepare(
              `SELECT idx, type, speaker_normalized, text, scene_number, scene_heading
               FROM script_lines
               WHERE script_id = ? AND idx BETWEEN ? AND ?
               ORDER BY idx`,
            )
            .all(payload.script_id, from, to) as Array<{
            idx: number;
            type: string;
            speaker_normalized: string | null;
            text: string;
            scene_number: number | null;
            scene_heading: string | null;
          }>;
          return { ok: true, lines: rows };
        } finally {
          db.close();
        }
      },
    },
    "acting.character.set_voice": {
      description: "Update a character's voice/rate for a script.",
      schema: z.object({
        script_id: z.number().int().positive(),
        normalized_name: z.string().min(1),
        voice: z.string().min(1),
        rate: z.string().min(1),
      }),
      async handler(payload) {
        const { db } = openActingDb();
        try {
          db.prepare(
            `UPDATE script_characters
             SET voice = ?, rate = ?
             WHERE script_id = ? AND normalized_name = ?`,
          ).run(payload.voice, payload.rate, payload.script_id, payload.normalized_name);
          return { ok: true };
        } finally {
          db.close();
        }
      },
    },
    "break.menu": {
      description: "Generate a break menu for a site (same as CLI break).",
      schema: z.object({
        site_slug: z.string().min(1),
        minutes: z.number().int().positive().optional(),
        context: z.string().optional(),
        location: z.string().optional(),
      }),
      async handler(payload) {
        const { db } = openCoreDb();
        try {
          const resolvedContext =
            payload.location || payload.context ? payload.context : (getSetting(db, "current_context") ?? undefined);

          const menu = buildBreakMenu({
            db,
            siteSlug: payload.site_slug,
            feedMinutes: payload.minutes,
            context: payload.context,
            location: payload.location,
            ...(payload.location ? {} : { context: resolvedContext }),
          });

          // Log served menu + served cards (needed to preserve cooldown logic in selection).
          insertEvent(db, {
            type: "break_served",
            eventKey: menu.event_key,
            siteId: getSiteBySlug(db, menu.site)?.id ?? null,
            siteSlug: menu.site,
            minutes: (menu.lanes.find((l: any) => l.type === "feed") as any)?.minutes ?? null,
            metaJson: JSON.stringify(menu),
          });

          for (const lane of menu.lanes as any[]) {
            if (lane?.card?.id && lane.type !== "feed" && lane.type !== "same_need") {
              insertEvent(db, {
                type: "card_served",
                eventKey: menu.event_key,
                siteSlug: menu.site,
                cardId: lane.card.id,
                metaJson: JSON.stringify({ source: "break", lane: lane.type }),
              });
            }
          }

          const hasActingLane = (menu.lanes as any[]).some((l) => l.type === "acting");
          const recentActingScripts = hasActingLane ? loadRecentActingScripts(5) : [];
          const lanes = (menu.lanes as any[]).map((l) =>
            l.type === "acting" ? ({ ...l, recent_scripts: recentActingScripts } as any) : l,
          );

          return { ok: true, menu: { ...menu, lanes } };
        } finally {
          db.close();
        }
      },
    },
    "break.choose": {
      description: "Choose a break lane for a previously served break menu.",
      schema: z.object({
        event_key: z.string().min(1),
        lane: z.string().min(1),
      }),
      async handler(payload) {
        const { db } = openCoreDb();
        try {
          const served = getBreakServedEvent(db, payload.event_key);
          if (!served?.meta_json) return { ok: false, error: "break_menu_not_found", event_key: payload.event_key };
          const menu = JSON.parse(served.meta_json) as any;

          insertEvent(db, {
            type: "break_chosen",
            eventKey: payload.event_key,
            siteSlug: menu.site,
            metaJson: JSON.stringify({ lane: payload.lane }),
          });

          const lane = payload.lane;
          if (lane === "same_need") {
            const same = (menu.lanes as any[]).find((l) => l.type === "same_need") ?? null;
            insertEvent(db, { type: "same_need_chosen", eventKey: payload.event_key, siteSlug: menu.site });
            return { ok: true, lane: "same_need", prompt: same?.prompt ?? "" };
          }

          if (lane === "feed") {
            // Privileged: edits /etc/hosts and may spawn a timer process. We intentionally reuse the existing,
            // battle-tested CLI implementation behind a strict action boundary.
            const res = runSiteToggleWithSudo(["choose", payload.event_key, "feed", "--json"]);
            if (!res.ok) {
              return {
                ok: false,
                error: res.error,
                details: res.details,
                hint:
                  "This requires passwordless sudo for site-toggle (we call: sudo -n ./site-toggle choose <event_key> feed --json).",
              };
            }
            return res.result;
          }

          const isCardLaneType = (t: string): boolean =>
            ["card", "card2", "physical", "verb", "noun", "lesson", "sovt", "acting", "fusion"].includes(t);

          const resolveCardLane = (requested: string): any | null => {
            const direct = (menu.lanes as any[]).find((l) => l.type === requested);
            if (direct?.card?.id) return direct;
            if (requested === "card" || requested === "card2") {
              const allCardLanes = (menu.lanes as any[]).filter((l) => l?.card?.id);
              const idx = requested === "card" ? 0 : 1;
              return allCardLanes[idx] ?? null;
            }
            return null;
          };

          if (isCardLaneType(lane)) {
            const cardLane = resolveCardLane(lane);
            if (!cardLane?.card?.id) return { ok: false, error: "lane_missing", lane };
            const resolvedLane = String(cardLane.type);
            insertEvent(db, {
              type: "card_chosen",
              eventKey: payload.event_key,
              siteSlug: menu.site,
              cardId: cardLane.card.id,
              metaJson: JSON.stringify({ lane: resolvedLane }),
            });
            return { ok: true, lane: resolvedLane, card: cardLane.card };
          }

          return { ok: false, error: "unknown_lane", lane };
        } finally {
          db.close();
        }
      },
    },
    "spanish.session.start": {
      description: "Start a Spanish tutoring session driven by Codex (brain).",
      schema: z.object({
        event_key: z.string().optional(),
        lane: z.enum(["verb", "noun", "lesson", "fusion"]).optional(),
        card_id: z.number().int().optional(),
        card_key: z.string().optional(),
        card_prompt: z.string().min(1),
      }),
      async handler(payload) {
        const { db } = openCoreDb();
        try {
          const sessionId = makeSpanishId("sp_sess");

          insertSpanishSession(db, {
            id: sessionId,
            status: "open",
            source: "break_menu",
            event_key: payload.event_key ?? null,
            lane: payload.lane ?? null,
            card_id: payload.card_id ?? null,
            card_key: payload.card_key ?? null,
            card_prompt: payload.card_prompt,
            codex_thread_id: null,
            pending_tool_json: null,
            meta_json: JSON.stringify({ v: 1 }),
          });

          wsBroadcast({ type: "spanish.session", event: "started", session_id: sessionId });

          const system = [
            "You are a Spanish tutor running inside a local web UI. Be concise and interactive.",
            "",
            "Return EXACTLY ONE JSON object as your final message each turn (no markdown, no code fences).",
            "The JSON MUST match this schema:",
            JSON.stringify(
              {
                v: 1,
                assistant_text: "string",
                tool_requests: [
                  {
                    id: "t1",
                    tool: "speak",
                    args: { text: "string", voice: "es-ES-AlvaroNeural|es-ES-ElviraNeural|es-MX-JorgeNeural|es-MX-DaliaNeural", rate: "-25%" },
                  },
                  { id: "t2", tool: "listen", args: { target_text: "string" } },
                ],
                await: "user|listen_result|done",
              },
              null,
              2,
            ),
            "",
            "Rules:",
            "- Use Castilian Spanish with vosotros unless the prompt suggests otherwise.",
            "- tool_requests must always be an array (possibly empty).",
            "- Only request tools 'speak' and 'listen'.",
            "- When you request 'listen', set await='listen_result' and include target_text for the user to pronounce.",
            "- When you need a typed answer, set await='user'.",
            "",
            "Start by asking the first question based on CARD_PROMPT.",
          ].join("\n");

          const initialPrompt = `${system}\n\nCARD_PROMPT:\n${payload.card_prompt}\n`;
          insertSpanishTurn(db, {
            session_id: sessionId,
            idx: nextSpanishTurnIdx(db, sessionId),
            role: "system",
            kind: "prompt",
            content: initialPrompt,
          });

          const logDir = path.join(stateDir, "spanish", "codex", sessionId);
          fs.mkdirSync(logDir, { recursive: true });

          const run = await runCodex({
            cwd: repoRootFromHere(),
            prompt: initialPrompt,
            sandbox: "read-only",
            timeoutMs: 120_000,
            logJsonlPath: path.join(logDir, "turn0.jsonl"),
          });

          if (!run.ok) {
            insertSpanishTurn(db, {
              session_id: sessionId,
              idx: nextSpanishTurnIdx(db, sessionId),
              role: "assistant",
              kind: "error",
              content: `Codex failed: ${run.error}`,
              json: run,
            });
            return { ok: false, error: "codex_failed", details: run, session_id: sessionId };
          }

          updateSpanishSession(db, sessionId, { codex_thread_id: run.thread_id });

          const raw = String(run.last_agent_message ?? "").trim();
          const parsed = safeJsonParse(raw);
          const brainParsed = SpanishBrainOutputSchema.safeParse(parsed);
          if (!brainParsed.success) {
            insertSpanishTurn(db, {
              session_id: sessionId,
              idx: nextSpanishTurnIdx(db, sessionId),
              role: "assistant",
              kind: "brain_raw",
              content: raw,
            });
            return { ok: false, error: "bad_brain_output", session_id: sessionId, raw };
          }

          const brain: SpanishBrainOutput = brainParsed.data;
          insertSpanishTurn(db, {
            session_id: sessionId,
            idx: nextSpanishTurnIdx(db, sessionId),
            role: "assistant",
            kind: "brain_output",
            content: brain.assistant_text,
            json: brain,
          });

          wsBroadcast({ type: "spanish.assistant", session_id: sessionId, brain });

          const speakResults: any[] = [];
          let pendingListen: any | null = null;
          for (const tr of brain.tool_requests) {
            if (tr.tool === "speak") {
              const spoken = sanitizeTtsText(tr.args.text);
              if (!spoken) continue;
              const tts = await renderTts({
                text: spoken,
                voice: tr.args.voice,
                rate: tr.args.rate,
                sanitizerVersion: TTS_SANITIZER_VERSION,
              });
              const result = { id: tr.id, tool: "speak", audio_id: tts.audio_id, url: `/api/audio/${tts.audio_id}`, duration_sec: tts.duration_sec };
              speakResults.push(result);
              insertSpanishTurn(db, { session_id: sessionId, idx: nextSpanishTurnIdx(db, sessionId), role: "tool", kind: "tool_result", json: result });
              wsBroadcast({ type: "spanish.tool", session_id: sessionId, event: "tool_result", tool: "speak", result });
            }
            if (tr.tool === "listen") {
              pendingListen = { id: tr.id, tool: "listen", target_text: tr.args.target_text };
              updateSpanishSession(db, sessionId, { pending_tool_json: JSON.stringify(tr) });
              wsBroadcast({ type: "spanish.tool", session_id: sessionId, event: "tool_pending", tool: "listen", args: pendingListen });
            }
          }

          return { ok: true, session_id: sessionId, thread_id: run.thread_id, brain, speak_results: speakResults, pending_listen: pendingListen };
        } finally {
          db.close();
        }
      },
    },
    "spanish.session.answer": {
      description: "Submit a typed answer to an existing Spanish session (Codex resume).",
      schema: z.object({
        session_id: z.string().min(1),
        answer: z.string().min(1).max(4000),
      }),
      async handler(payload) {
        if (spanishBusy.has(payload.session_id)) return { ok: false, error: "turn_in_progress" };
        spanishBusy.add(payload.session_id);
        const { db } = openCoreDb();
        try {
          const sess = getSpanishSession(db, payload.session_id);
          if (!sess) return { ok: false, error: "session_not_found" };
          if (sess.status !== "open") return { ok: false, error: "session_not_open", status: sess.status };
          if (!sess.codex_thread_id) return { ok: false, error: "missing_codex_thread_id" };
          if (sess.pending_tool_json) return { ok: false, error: "pending_listen" };

          insertSpanishTurn(db, {
            session_id: payload.session_id,
            idx: nextSpanishTurnIdx(db, payload.session_id),
            role: "user",
            kind: "answer",
            content: payload.answer,
          });
          wsBroadcast({ type: "spanish.user", session_id: payload.session_id, answer: payload.answer });

          const followup = JSON.stringify({ kind: "user_answer", text: payload.answer });

          const logDir = path.join(stateDir, "spanish", "codex", payload.session_id);
          fs.mkdirSync(logDir, { recursive: true });
          const run = await runCodex({
            cwd: repoRootFromHere(),
            resumeThreadId: sess.codex_thread_id,
            prompt: followup,
            sandbox: "read-only",
            timeoutMs: 120_000,
            logJsonlPath: path.join(logDir, `turn${Date.now()}.jsonl`),
          });
          if (!run.ok) {
            insertSpanishTurn(db, {
              session_id: payload.session_id,
              idx: nextSpanishTurnIdx(db, payload.session_id),
              role: "assistant",
              kind: "error",
              content: `Codex failed: ${run.error}`,
              json: run,
            });
            return { ok: false, error: "codex_failed", details: run };
          }

          const raw = String(run.last_agent_message ?? "").trim();
          const parsed = safeJsonParse(raw);
          const brainParsed = SpanishBrainOutputSchema.safeParse(parsed);
          if (!brainParsed.success) {
            insertSpanishTurn(db, { session_id: payload.session_id, idx: nextSpanishTurnIdx(db, payload.session_id), role: "assistant", kind: "brain_raw", content: raw });
            return { ok: false, error: "bad_brain_output", raw };
          }

          const brain: SpanishBrainOutput = brainParsed.data;
          insertSpanishTurn(db, {
            session_id: payload.session_id,
            idx: nextSpanishTurnIdx(db, payload.session_id),
            role: "assistant",
            kind: "brain_output",
            content: brain.assistant_text,
            json: brain,
          });
          wsBroadcast({ type: "spanish.assistant", session_id: payload.session_id, brain });

          const speakResults: any[] = [];
          let pendingListen: any | null = null;
          updateSpanishSession(db, payload.session_id, { pending_tool_json: null });
          for (const tr of brain.tool_requests) {
            if (tr.tool === "speak") {
              const spoken = sanitizeTtsText(tr.args.text);
              if (!spoken) continue;
              const tts = await renderTts({
                text: spoken,
                voice: tr.args.voice,
                rate: tr.args.rate,
                sanitizerVersion: TTS_SANITIZER_VERSION,
              });
              const result = { id: tr.id, tool: "speak", audio_id: tts.audio_id, url: `/api/audio/${tts.audio_id}`, duration_sec: tts.duration_sec };
              speakResults.push(result);
              insertSpanishTurn(db, { session_id: payload.session_id, idx: nextSpanishTurnIdx(db, payload.session_id), role: "tool", kind: "tool_result", json: result });
              wsBroadcast({ type: "spanish.tool", session_id: payload.session_id, event: "tool_result", tool: "speak", result });
            }
            if (tr.tool === "listen") {
              pendingListen = { id: tr.id, tool: "listen", target_text: tr.args.target_text };
              updateSpanishSession(db, payload.session_id, { pending_tool_json: JSON.stringify(tr) });
              wsBroadcast({ type: "spanish.tool", session_id: payload.session_id, event: "tool_pending", tool: "listen", args: pendingListen });
            }
          }

          return { ok: true, brain, speak_results: speakResults, pending_listen: pendingListen };
        } finally {
          db.close();
          spanishBusy.delete(payload.session_id);
        }
      },
    },
    "spanish.session.end": {
      description: "End a Spanish session (mark completed/abandoned).",
      schema: z.object({
        session_id: z.string().min(1),
        status: z.enum(["completed", "abandoned"]),
        note: z.string().max(4000).optional(),
      }),
      async handler(payload) {
        const { db } = openCoreDb();
        try {
          const sess = getSpanishSession(db, payload.session_id);
          if (!sess) return { ok: false, error: "session_not_found" };
          updateSpanishSession(db, payload.session_id, { status: payload.status, pending_tool_json: null });
          insertSpanishTurn(db, {
            session_id: payload.session_id,
            idx: nextSpanishTurnIdx(db, payload.session_id),
            role: "system",
            kind: "session_end",
            content: payload.note ?? null,
            json: { status: payload.status },
          });
          wsBroadcast({ type: "spanish.session", event: "ended", session_id: payload.session_id, status: payload.status });
          return { ok: true };
        } finally {
          db.close();
        }
      },
    },
    "spanish.sessions.list": {
      description: "List recent Spanish sessions (for transcript viewing).",
      schema: z.object({ limit: z.number().int().min(1).max(50).optional() }),
      async handler(payload) {
        const { db } = openCoreDb();
        try {
          const limit = payload.limit ?? 20;
          const sessions = listSpanishSessions(db, limit);
          return { ok: true, sessions };
        } finally {
          db.close();
        }
      },
    },
    "spanish.session.transcript": {
      description: "Fetch a Spanish session + its turns (for transcript viewing).",
      schema: z.object({ session_id: z.string().min(1), limit: z.number().int().min(1).max(10_000).optional() }),
      async handler(payload) {
        const { db } = openCoreDb();
        try {
          const session = getSpanishSession(db, payload.session_id);
          if (!session) return { ok: false, error: "session_not_found" };
          const turns = listSpanishTurns(db, payload.session_id, payload.limit ?? 2000);
          return { ok: true, session, turns };
        } finally {
          db.close();
        }
      },
    },
    "hosts.unblock_all": {
      description: "Unblock all sites for a fixed number of minutes (privileged; requires passwordless sudo).",
      schema: z.object({
        minutes: z.number().int().min(1).max(180),
      }),
      async handler(payload) {
        // Privileged: edits /etc/hosts and spawns timers.
        // We reuse CLI implementation so we don't duplicate tricky host editing behavior in the server.
        const res = runSiteToggleWithSudo(["on", "", String(payload.minutes), "--json"]);
        if (!res.ok) {
          return {
            ok: false,
            error: res.error,
            details: res.details,
            hint: "This requires passwordless sudo for site-toggle (sudo -n).",
          };
        }
        return res.result;
      },
    },
  };

  const app = new Hono();
  let runtimePort = 0;

  app.get("/api/status", (c) => {
    return c.json({
      ok: true,
      pid: process.pid,
      started_at: startedAt,
      token,
      port: runtimePort,
      ui_url: runtimePort ? `http://127.0.0.1:${runtimePort}/` : null,
      ws_url: runtimePort ? `ws://127.0.0.1:${runtimePort}/ws` : null,
      sudo_site_toggle_ok: sudoSiteToggleOk,
    });
  });

  app.get("/api/capabilities", (c) => {
    return c.json({
      ok: true,
      v: 1,
      actions: Object.entries(actionHandlers).map(([action, info]) => ({
        action,
        description: info.description,
      })),
    });
  });

  app.post("/api/action", async (c) => {
    const got = c.req.header("x-cb-token");
    if (!got || got !== token) return c.json({ ok: false, error: "missing_or_bad_token" }, 403);

    const raw = await c.req.json().catch(() => null);
    const envParsed = ActionEnvelopeV1.safeParse(raw);
    if (!envParsed.success) return c.json({ ok: false, error: "invalid_request" }, 400);

    const { action, payload } = envParsed.data;
    const entry = actionHandlers[action];
    if (!entry) return c.json({ ok: false, error: "unknown_action", action }, 404);

    const payloadParsed = entry.schema.safeParse(payload);
    if (!payloadParsed.success) return c.json({ ok: false, error: "invalid_payload" }, 400);

    const res = await entry.handler(payloadParsed.data);
    return c.json(res);
  });

  app.post("/api/spanish/listen/upload", async (c) => {
    const got = c.req.header("x-cb-token");
    if (!got || got !== token) return c.json({ ok: false, error: "missing_or_bad_token" }, 403);

    const form = await c.req.formData().catch(() => null);
    if (!form) return c.json({ ok: false, error: "invalid_form_data" }, 400);

    const sessionId = String(form.get("session_id") ?? "").trim();
    const file = form.get("attempt_wav");
    if (!sessionId) return c.json({ ok: false, error: "missing_session_id" }, 400);
    if (!(file instanceof File)) return c.json({ ok: false, error: "missing_attempt_wav" }, 400);

    if (spanishBusy.has(sessionId)) return c.json({ ok: false, error: "turn_in_progress" }, 409);
    spanishBusy.add(sessionId);

    const { db } = openCoreDb();
    try {
      const sess = getSpanishSession(db, sessionId);
      if (!sess) return c.json({ ok: false, error: "session_not_found" }, 404);
      if (sess.status !== "open") return c.json({ ok: false, error: "session_not_open", status: sess.status }, 400);
      if (!sess.codex_thread_id) return c.json({ ok: false, error: "missing_codex_thread_id" }, 400);
      if (!sess.pending_tool_json) return c.json({ ok: false, error: "no_pending_listen" }, 400);

      const pendingRaw = safeJsonParse(sess.pending_tool_json);
      const pendingParsed = SpanishToolRequestSchema.safeParse(pendingRaw);
      if (!pendingParsed.success || pendingParsed.data.tool !== "listen") {
        return c.json({ ok: false, error: "bad_pending_tool" }, 400);
      }

      const pending = pendingParsed.data;

      const uploadDir = path.join(stateDir, "spanish", "uploads", sessionId);
      fs.mkdirSync(uploadDir, { recursive: true });
      const uploadId = makeId("upl");
      const rawPath = path.join(uploadDir, `${uploadId}.wav`);
      const buf = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(rawPath, buf);

      let analysis: any;
      try {
        analysis = await analyzeListenAttempt({
          stateDir,
          target_text: pending.args.target_text,
          attempt_wav_path: rawPath,
          voice: "es-ES-AlvaroNeural",
          rate: "-25%",
        });
      } catch (e: unknown) {
        const err = e as { message?: string };
        insertSpanishTurn(db, { session_id: sessionId, idx: nextSpanishTurnIdx(db, sessionId), role: "tool", kind: "error", content: err.message || String(e) });
        return c.json({ ok: false, error: "listen_failed", message: err.message || String(e) }, 500);
      }

      const toolResult = { id: pending.id, tool: "listen", result: analysis };
      insertSpanishTurn(db, { session_id: sessionId, idx: nextSpanishTurnIdx(db, sessionId), role: "tool", kind: "tool_result", json: toolResult });
      wsBroadcast({ type: "spanish.tool", session_id: sessionId, event: "tool_result", tool: "listen", result: toolResult });

      updateSpanishSession(db, sessionId, { pending_tool_json: null });

      const followup = JSON.stringify({ kind: "tool_result", tool: "listen", id: pending.id, result: analysis });
      const logDir = path.join(stateDir, "spanish", "codex", sessionId);
      fs.mkdirSync(logDir, { recursive: true });

      const run = await runCodex({
        cwd: repoRootFromHere(),
        resumeThreadId: sess.codex_thread_id,
        prompt: followup,
        sandbox: "read-only",
        timeoutMs: 120_000,
        logJsonlPath: path.join(logDir, `listen-${uploadId}.jsonl`),
      });

      if (!run.ok) {
        insertSpanishTurn(db, { session_id: sessionId, idx: nextSpanishTurnIdx(db, sessionId), role: "assistant", kind: "error", content: `Codex failed: ${run.error}`, json: run });
        return c.json({ ok: false, error: "codex_failed", details: run }, 500);
      }

      const raw = String(run.last_agent_message ?? "").trim();
      const parsed = safeJsonParse(raw);
      const brainParsed = SpanishBrainOutputSchema.safeParse(parsed);
      if (!brainParsed.success) {
        insertSpanishTurn(db, { session_id: sessionId, idx: nextSpanishTurnIdx(db, sessionId), role: "assistant", kind: "brain_raw", content: raw });
        return c.json({ ok: false, error: "bad_brain_output", raw }, 500);
      }

      const brain = brainParsed.data as SpanishBrainOutput;
      insertSpanishTurn(db, { session_id: sessionId, idx: nextSpanishTurnIdx(db, sessionId), role: "assistant", kind: "brain_output", content: brain.assistant_text, json: brain });
      wsBroadcast({ type: "spanish.assistant", session_id: sessionId, brain });

      const speakResults: any[] = [];
      let pendingListen: any | null = null;
      for (const tr of brain.tool_requests) {
        if (tr.tool === "speak") {
          const spoken = sanitizeTtsText(tr.args.text);
          if (!spoken) continue;
          const tts = await renderTts({
            text: spoken,
            voice: tr.args.voice,
            rate: tr.args.rate,
            sanitizerVersion: TTS_SANITIZER_VERSION,
          });
          const result = { id: tr.id, tool: "speak", audio_id: tts.audio_id, url: `/api/audio/${tts.audio_id}`, duration_sec: tts.duration_sec };
          speakResults.push(result);
          insertSpanishTurn(db, { session_id: sessionId, idx: nextSpanishTurnIdx(db, sessionId), role: "tool", kind: "tool_result", json: result });
          wsBroadcast({ type: "spanish.tool", session_id: sessionId, event: "tool_result", tool: "speak", result });
        }
        if (tr.tool === "listen") {
          pendingListen = { id: tr.id, tool: "listen", target_text: tr.args.target_text };
          updateSpanishSession(db, sessionId, { pending_tool_json: JSON.stringify(tr) });
          wsBroadcast({ type: "spanish.tool", session_id: sessionId, event: "tool_pending", tool: "listen", args: pendingListen });
        }
      }

      return c.json({ ok: true, upload_id: uploadId, analysis, brain, speak_results: speakResults, pending_listen: pendingListen });
    } finally {
      db.close();
      spanishBusy.delete(sessionId);
    }
  });

  app.get("/api/audio/:id", async (c) => {
    const id = c.req.param("id");
    if (!/^[a-f0-9]{24}$/.test(id)) return c.json({ ok: false, error: "bad_audio_id" }, 400);
    const cacheDir = resolveTtsCacheDir();
    const mp3Path = path.join(cacheDir, `${id}.mp3`);
    if (!fs.existsSync(mp3Path)) return c.json({ ok: false, error: "not_found" }, 404);
    return new Response(Bun.file(mp3Path), { headers: { "content-type": "audio/mpeg" } });
  });

  const repoRoot = repoRootFromHere();
  const uiDistDir = path.join(repoRoot, "packages", "ui", "dist");
  const uiIndexPath = path.join(uiDistDir, "index.html");

  function serveUiStatic(pathname: string): Response {
    if (!fs.existsSync(uiIndexPath)) {
      return new Response(
        "UI not built. Run:\n  pnpm --filter @circuit-breaker/ui build\n\nDev mode:\n  site-toggle ui start --dev\n  pnpm --filter @circuit-breaker/ui dev\n",
        { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } },
      );
    }

    if (pathname === "/" || pathname === "") {
      return new Response(Bun.file(uiIndexPath), { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    // Restrict to within dist dir (no traversal).
    const rel = pathname.startsWith("/") ? pathname.slice(1) : pathname;
    const full = path.resolve(uiDistDir, rel);
    if (full.startsWith(path.resolve(uiDistDir)) && fs.existsSync(full) && fs.statSync(full).isFile()) {
      const f = Bun.file(full);
      return new Response(f, { headers: { "content-type": f.type || "application/octet-stream" } });
    }

    // SPA fallback
    return new Response(Bun.file(uiIndexPath), { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  let server: ReturnType<typeof Bun.serve>;
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: desiredPort ?? 33291,
    websocket: {
      open(ws) {
        wsClients.add(ws);
        ws.send(JSON.stringify({ type: "server.state", now: new Date().toISOString() }));
        ws.send(JSON.stringify({ type: "agent.signals.snapshot", signals }));
      },
      close(ws) {
        wsClients.delete(ws);
      },
      async message(ws, message) {
        const text = typeof message === "string" ? message : new TextDecoder().decode(message);
        let msg: any = null;
        try {
          msg = JSON.parse(text);
        } catch {
          ws.send(JSON.stringify({ type: "error", scope: "ws", message: "invalid_json" }));
          return;
        }

        if (msg?.type === "run_lines.start") {
          const scriptId = Number(msg.script_id);
          const from = Number(msg.from ?? 0);
          const to = Number(msg.to ?? 1_000_000);
          const me = typeof msg.me === "string" ? msg.me : "";
          const meNorm = normalizeMeName(me);

          const { db } = openActingDb();
          const lines = db
            .prepare(
              `SELECT idx, type, speaker_normalized, text
               FROM script_lines
               WHERE script_id = ? AND idx BETWEEN ? AND ?
               ORDER BY idx`,
            )
            .all(scriptId, from, to) as RunLinesSession["lines"];
          const characters = db
            .prepare("SELECT normalized_name, voice, rate FROM script_characters WHERE script_id = ?")
            .all(scriptId) as RunLinesSession["characters"];
          db.close();

          const sessionId = makeId("sess");
          const rawMode = typeof msg.mode === "string" ? msg.mode : "practice";
          const parsedMode: RunLinesSession["mode"] =
            rawMode === "read_through" || rawMode === "practice" || rawMode === "speed_through"
              ? rawMode
              : rawMode === "boss"
                ? "speed_through"
                : rawMode === "learn"
                  ? "read_through"
                  : "practice";

          const speedFromMode = parsedMode === "speed_through" ? 1.3 : 1.0;
          const session: RunLinesSession = {
            id: sessionId,
            script_id: scriptId,
            from,
            to,
            mode: parsedMode,
            me_norm: meNorm,
            read_all: Boolean(msg.read_all),
            pause_mult: Number(msg.pause_mult ?? 1.0),
            pause_min_sec: Number(msg.pause_min_sec ?? 1.0),
            pause_max_sec: Number(msg.pause_max_sec ?? 12.0),
            cue_words: Number(msg.cue_words ?? 0),
            reveal_after: Boolean(msg.reveal_after),
            speed_mult: Number(msg.speed_mult ?? speedFromMode),
            playing: false,
            pending_self_line: null,
            event_seq: 0,
            idx: 0,
            lines,
            characters,
          };
          sessions.set(sessionId, session);

          ws.send(
            JSON.stringify({ type: "run_lines.session", event: "started", session_id: sessionId, script_id: scriptId, from, to }),
          );
          return;
        }

        if (msg?.type === "run_lines.play") {
          const sessionId = String(msg.session_id ?? "");
          const session = sessions.get(sessionId);
          if (!session) return;
          session.playing = true;
          await emitNextRunLineEvent(ws, session);
          return;
        }

        if (msg?.type === "run_lines.ack") {
          const sessionId = String(msg.session_id ?? "");
          const session = sessions.get(sessionId);
          if (!session) return;
          if (!session.playing) return;
          await emitNextRunLineEvent(ws, session);
          return;
        }

        if (msg?.type === "run_lines.stop") {
          const sessionId = String(msg.session_id ?? "");
          const session = sessions.get(sessionId);
          if (!session) return;
          sessions.delete(sessionId);
          ws.send(JSON.stringify({ type: "run_lines.session", event: "ended", session_id: sessionId }));
          return;
        }

        if (msg?.type === "run_lines.set_speed") {
          const sessionId = String(msg.session_id ?? "");
          const session = sessions.get(sessionId);
          if (!session) return;
          const speed = Number(msg.speed_mult ?? 1.0);
          session.speed_mult = Number.isFinite(speed) && speed > 0 ? speed : 1.0;
          ws.send(JSON.stringify({ type: "run_lines.session", event: "speed", session_id: sessionId, speed_mult: session.speed_mult }));
          return;
        }

        if (msg?.type === "run_lines.seek") {
          const sessionId = String(msg.session_id ?? "");
          const session = sessions.get(sessionId);
          if (!session) return;

          const from = Number(msg.from ?? session.from);
          const to = Number(msg.to ?? session.to);
          const { db } = openActingDb();
          const lines = db
            .prepare(
              `SELECT idx, type, speaker_normalized, text
               FROM script_lines
               WHERE script_id = ? AND idx BETWEEN ? AND ?
               ORDER BY idx`,
            )
            .all(session.script_id, from, to) as RunLinesSession["lines"];
          db.close();

          session.from = from;
          session.to = to;
          session.lines = lines;
          session.idx = 0;
          session.pending_self_line = null;
          session.event_seq = 0;

          ws.send(JSON.stringify({ type: "run_lines.session", event: "seeked", session_id: sessionId, from, to }));
          if (session.playing) await emitNextRunLineEvent(ws, session);
          return;
        }
      },
    },
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/ws") {
        const got = url.searchParams.get("token") ?? "";
        if (!got || got !== token) return new Response("missing_or_bad_token", { status: 403 });
        const ok = server.upgrade(req, { data: {} });
        if (ok) return;
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      if (url.pathname.startsWith("/api/")) {
        return app.fetch(req);
      }

      if (dev) {
        return new Response("Dev mode: UI served by Vite on :5173. This server exposes /api/* and /ws.", {
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }

      return serveUiStatic(url.pathname);
    },
  });
  runtimePort = server.port ?? (desiredPort ?? 33291);

  writeState(stateDir, {
    version: 1,
    pid: process.pid,
    port: runtimePort,
    started_at: startedAt,
    ui_url: `http://127.0.0.1:${runtimePort}/`,
    ws_url: `ws://127.0.0.1:${runtimePort}/ws`,
    token,
    log_path: logPath,
  });

  console.log(`[ui-server] listening on http://127.0.0.1:${runtimePort}/  (dev=${dev})`);
}

async function emitNextRunLineEvent(ws: any, session: RunLinesSession): Promise<void> {
  if (session.pending_self_line) {
    const p = session.pending_self_line;
    session.pending_self_line = null;
    ws.send(
      JSON.stringify({
        type: "run_lines.event",
        session_id: session.id,
        event_id: makeEventId(session),
        kind: "line",
        idx: p.idx,
        speaker: p.speaker,
        text: p.text,
        audio: { id: p.audio_id, url: `/api/audio/${p.audio_id}`, duration_sec: p.duration_sec },
        playback_rate: clamp(0.5, 3.0, session.speed_mult),
      }),
    );
    return;
  }

  while (session.idx < session.lines.length) {
    const l = session.lines[session.idx];
    session.idx += 1;
    if (!l) continue;

    if (l.type !== "dialogue") {
      ws.send(
        JSON.stringify({
          type: "run_lines.event",
          session_id: session.id,
          event_id: makeEventId(session),
          kind: "direction",
          idx: l.idx,
          text: l.text,
        }),
      );
      return;
    }

    const speaker = (l.speaker_normalized ?? "").trim();
    const spoken = sanitizeTtsText(l.text);
    if (!spoken) continue;

    const speed = clamp(0.5, 3.0, session.speed_mult);
    const isMe = !session.read_all && speaker && speaker === session.me_norm;

    if (session.mode === "speed_through" && !isMe) {
      const gapSec = clamp(session.pause_min_sec, session.pause_max_sec, estimatedSpeakSeconds(spoken) / speed);
      ws.send(
        JSON.stringify({
          type: "run_lines.event",
          session_id: session.id,
          event_id: makeEventId(session),
          kind: "gap",
          idx: l.idx,
          speaker: speaker || null,
          text: l.text,
          duration_sec: gapSec,
        }),
      );
      return;
    }

    const ch = session.characters.find((c) => c.normalized_name === speaker) ?? null;
    const voice = ch?.voice ?? "en-US-GuyNeural";
    const rate = ch?.rate ?? "+0%";
    const tts = await renderTts({ text: spoken, voice, rate, sanitizerVersion: TTS_SANITIZER_VERSION });

    if (isMe && session.mode !== "read_through") {
      const pauseSec = clamp(session.pause_min_sec, session.pause_max_sec, (tts.duration_sec * session.pause_mult) / speed);
      session.pending_self_line = {
        idx: l.idx,
        speaker: speaker || null,
        text: l.text,
        audio_id: tts.audio_id,
        duration_sec: tts.duration_sec,
      };
      ws.send(
        JSON.stringify({
          type: "run_lines.event",
          session_id: session.id,
          event_id: makeEventId(session),
          kind: "pause",
          idx: l.idx,
          duration_sec: pauseSec,
          cue: session.cue_words > 0 ? cuePrefixWords(spoken, session.cue_words) : null,
        }),
      );
      return;
    }

    ws.send(
      JSON.stringify({
        type: "run_lines.event",
        session_id: session.id,
        event_id: makeEventId(session),
        kind: "line",
        idx: l.idx,
        speaker: speaker || null,
        text: l.text,
        audio: { id: tts.audio_id, url: `/api/audio/${tts.audio_id}`, duration_sec: tts.duration_sec },
        playback_rate: speed,
      }),
    );
    return;
  }

  ws.send(JSON.stringify({ type: "run_lines.session", event: "ended", session_id: session.id }));
}

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

function cuePrefixWords(text: string, n: number): string {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, Math.max(0, n)).join(" ");
}

function makeEventId(session: RunLinesSession): string {
  session.event_seq += 1;
  return `${session.id}_evt_${session.event_seq}`;
}

main().catch((e) => {
  console.error("[ui-server] fatal:", e);
  process.exit(1);
});
