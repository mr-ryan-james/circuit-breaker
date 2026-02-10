import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Hono } from "hono";
import { z } from "zod";

import {
  buildBreakMenu,
  countDueSrsCards,
  getBreakServedEvent,
  getSetting,
  setSetting,
  getSiteBySlug,
  insertEvent,
  insertPitchResult,
  listDueSrsCards,
  listPitchResults,
  recordSrsReview,
} from "@circuit-breaker/core";

import { defaultStateDir, writeState } from "./state.js";
import { openActingDb } from "./actingDb.js";
import { openCoreDb } from "./coreDb.js";
import { estimatedSpeakSeconds, sanitizeTtsText, TTS_SANITIZER_VERSION } from "./sanitize.js";
import { renderTts, resolveTtsCacheDir } from "./tts.js";
import { createBrainRunner, type BrainResult } from "./brainRunner.js";
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
  type BrainName,
} from "./spanishDb.js";
import {
  SpanishBrainOutputSchema,
  SpanishToolRequestSchema,
  type SpanishBrainOutput,
} from "./spanishBrainOutput.js";

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

// Bun's websocket `ws.data` is typed as `unknown` by default. We keep a stable
// per-connection id in a WeakMap so we can clean up in-memory sessions on close.
const wsIds = new WeakMap<any, string>();

type RunLinesSession = {
  id: string;
  owner_ws_id: string;
  created_at_ms: number;
  last_activity_ms: number;
  play_started_ms: number | null;
  last_emitted_idx: number | null;
  prefetch_in_flight: boolean;
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

async function runSiteToggle(args: string[]): Promise<{ ok: true; result: any } | { ok: false; error: string; details?: any }> {
  const st = siteTogglePath();
  const proc = Bun.spawn([st, ...args], { cwd: repoRootFromHere(), stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text().catch(() => ""),
    new Response(proc.stderr).text().catch(() => ""),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    return {
      ok: false,
      error: "site_toggle_failed",
      details: { exit_code: exitCode, stdout: stdout.slice(0, 2000), stderr: stderr.slice(0, 2000) },
    };
  }

  try {
    return { ok: true, result: JSON.parse(stdout) };
  } catch {
    return { ok: false, error: "site_toggle_bad_json", details: { stdout: stdout.slice(0, 2000), stderr: stderr.slice(0, 2000) } };
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

// SpanishBrainOutputSchema, SpanishToolRequestSchema, SpanishBrainOutput
// imported from ./spanishBrainOutput.js

function safeJsonParse(input: string): any | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  const tryParse = (s: string): any | null => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };

  // Fast path: already-valid JSON.
  const direct = tryParse(raw);
  if (direct !== null) return direct;

  // Common failure mode: model wraps the object in markdown code fences.
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence && fence[1]) {
    const inner = fence[1].trim();
    const parsed = tryParse(inner);
    if (parsed !== null) return parsed;
  }

  // Last resort: parse the substring between the first '{' and last '}'.
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) {
    const slice = raw.slice(first, last + 1);
    const parsed = tryParse(slice);
    if (parsed !== null) return parsed;
  }

  return null;
}

function normalizeBrainName(input: unknown): BrainName {
  return input === "claude" ? "claude" : "codex";
}

const SPANISH_BRAIN_OUTPUT_EXAMPLE_JSON = JSON.stringify(
  {
    v: 1,
    assistant_text: "string",
    // Optional progress fields (include when useful, especially during scored quizzes).
    score: { correct: 3, total: 15 },
    phase: "quiz",
    question_number: 3,
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
);

/** System prompt shared across both Codex and Claude brain runners. */
function spanishSystemPrompt(lane: string | null | undefined): string {
  const laneLabel = lane ? lane.trim() : "";
  const laneGuidance = (() => {
    if (laneLabel === "verb") {
      return [
        "Lane-specific guidance (verb):",
        "- Run a conjugation drill. One tense at a time (presente -> indefinido -> imperfecto).",
        "- Ask for all 6 persons each tense (yo, tú, él/ella, nosotros, vosotros, ellos/ellas).",
        "- Use Castilian Spanish with vosotros.",
        "- If you track progress, use phase like: 'presente' | 'indefinido' | 'imperfecto' | 'review18'.",
      ].join("\n");
    }
    if (laneLabel === "noun") {
      return [
        "Lane-specific guidance (noun):",
        "- Run a vocabulary drill focused on article/gender, plural, and short example sentences.",
        "- Use Castilian Spanish with vosotros.",
        "- If you track progress, use phase like: 'article' | 'plural' | 'sentences'.",
      ].join("\n");
    }
    if (laneLabel === "lesson") {
      return [
        "Lane-specific guidance (lesson):",
        "- Follow the card prompt's phases. Keep explanations concise and interactive.",
        "- If the prompt is a structured lesson: teach -> examples -> quiz.",
        "- During a quiz, include score {correct,total} and question_number (1-indexed).",
        "- Use phase like: 'teach' | 'examples' | 'quiz'.",
      ].join("\n");
    }
    if (laneLabel === "fusion") {
      return [
        "Lane-specific guidance (fusion):",
        "- Ask 7 quick questions that combine today's verb + noun + B1/B2 concept from the card prompt.",
        "- Track score {correct,total} and question_number (1..7) as you go.",
        "- Use phase like: 'fusion'.",
      ].join("\n");
    }
    return [
      "Lane-specific guidance:",
      "- Lane not specified. Follow CARD_PROMPT and keep it interactive (one question at a time).",
    ].join("\n");
  })();

  return [
    "You are a Spanish tutor running inside a local web UI. Be concise and interactive.",
    "",
    "Return EXACTLY ONE JSON object as your final message each turn (no markdown, no code fences).",
    "The JSON MUST match this schema:",
    SPANISH_BRAIN_OUTPUT_EXAMPLE_JSON,
    "",
    "Rules:",
    "- Use Castilian Spanish with vosotros unless the prompt suggests otherwise.",
    "- tool_requests must always be an array (possibly empty).",
    "- Only request tools 'speak' and 'listen'.",
    "- When you request 'listen', set await='listen_result' and include target_text for the user to pronounce.",
    "- When you need a typed answer, set await='user'.",
    "",
    `Lane: ${laneLabel || "(unknown)"}`,
    laneGuidance,
    "",
    "Start by asking the first question based on CARD_PROMPT.",
  ].join("\n");
}

function spanishRepairPrompt(args: { lane: string | null | undefined; badOutput: string; attempt: number }): string {
  const laneLabel = args.lane ? args.lane.trim() : "";
  const clipped = String(args.badOutput ?? "").trim().slice(0, 1500);
  return [
    "Your previous message was NOT valid JSON that matched the required schema.",
    "",
    "Return EXACTLY ONE JSON object and NOTHING ELSE:",
    "- No markdown",
    "- No code fences",
    "- No extra commentary before/after",
    "",
    "It MUST match this schema example:",
    SPANISH_BRAIN_OUTPUT_EXAMPLE_JSON,
    "",
    `Lane: ${laneLabel || "(unknown)"}`,
    `Repair attempt: ${args.attempt}`,
    "",
    "Re-emit your intended response (same content) but as a valid JSON object.",
    "",
    "Bad output (for reference):",
    clipped,
  ].join("\n");
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

  const RUN_LINES_SESSION_TTL_MS = 30 * 60 * 1000;

  function recordRunLinesPracticeEvent(session: RunLinesSession, outcome: "completed" | "stopped" | "disconnected" | "expired"): void {
    // This is best-effort: practice history is nice-to-have and should never crash the server.
    try {
      const now = Date.now();
      const started = session.play_started_ms ?? session.created_at_ms;
      const durationMs = Math.max(0, now - started);
      const loopsCompleted = outcome === "completed" ? 1 : 0;
      const lastIdx = session.last_emitted_idx ?? session.from;

      const { db } = openActingDb();
      try {
        db.prepare(
          `INSERT INTO script_practice_events
             (script_id, me_normalized, mode, read_all, from_idx, to_idx, loops_completed, last_idx, duration_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          session.script_id,
          session.me_norm,
          session.mode,
          session.read_all ? 1 : 0,
          session.from,
          session.to,
          loopsCompleted,
          lastIdx,
          durationMs,
        );
      } finally {
        db.close();
      }
    } catch {
      // ignore
    }
  }

  // Cleanup sweep for abandoned WS run-lines sessions (browser refresh, laptop sleep, etc.).
  setInterval(() => {
    const now = Date.now();
    for (const [id, s] of sessions) {
      if (now - s.last_activity_ms <= RUN_LINES_SESSION_TTL_MS) continue;
      sessions.delete(id);
      recordRunLinesPracticeEvent(s, "expired");
    }
  }, 60_000);

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

  function recordSpanishPracticeCompleted(
    db: ReturnType<typeof openCoreDb>["db"],
    sess: ReturnType<typeof getSpanishSession>,
    args: {
      status: "completed" | "abandoned";
      note?: string | null;
      auto?: boolean;
      score?: { correct: number; total: number } | null;
    },
  ): void {
    // Best-effort: practice tracking should never break the session lifecycle.
    try {
      if (!sess?.card_id) return;

      const score = args.score ?? null;
      const scoreRatio =
        score && Number.isFinite(score.correct) && Number.isFinite(score.total) && score.total > 0
          ? score.correct / score.total
          : null;

      // v1 SRS outcome derivation (single source of truth):
      // - If we have a non-trivial score (>=3 questions): success iff ratio >= 0.8.
      // - Else: completed => success, abandoned => failure.
      const outcome: "success" | "failure" =
        score && Number.isFinite(score.total) && score.total >= 3
          ? scoreRatio !== null && scoreRatio >= 0.8
            ? "success"
            : "failure"
          : args.status === "completed"
            ? "success"
            : "failure";

      insertEvent(db, {
        type: "practice_completed",
        eventKey: sess.event_key ?? sess.id,
        cardId: sess.card_id,
        metaJson: JSON.stringify({
          module_slug: "spanish",
          status: args.status,
          lane: sess.lane ?? null,
          session_id: sess.id,
          auto: Boolean(args.auto),
          note: args.note ?? null,
          score,
          score_ratio: scoreRatio,
          outcome,
        }),
      });

      // v1 SRS: track verb/noun/lesson lanes (explicitly exclude fusion).
      const lane = sess.lane ?? null;
      if (lane && (lane === "verb" || lane === "noun" || lane === "lesson")) {
        recordSrsReview(db, { cardId: sess.card_id, moduleSlug: "spanish", lane, outcome });
      }
    } catch {
      // ignore
    }
  }

  /**
   * Shared helper: parse + validate brain output, insert turns, render TTS, broadcast WS.
   * Used by spanish.session.start, spanish.session.answer, and /api/spanish/listen/upload.
   */
  async function processBrainResponse(
    db: ReturnType<typeof openCoreDb>["db"],
    sessionId: string,
    run: BrainResult,
  ): Promise<
    | { ok: true; brain: SpanishBrainOutput; speakResults: any[]; pendingListen: any | null; session_status: "open" | "completed" }
    | { ok: false; error: string; raw?: string }
  > {
    const sess = getSpanishSession(db, sessionId);
    const brainName: BrainName = normalizeBrainName(sess?.brain_name);
    const lane = sess?.lane ?? null;

    let currentRun: BrainResult = run;
    let raw = String(currentRun.last_agent_message ?? "").trim();

    // Codex sometimes violates the "single JSON object" constraint. Retry a couple times with a stricter prompt.
    const maxRetries = brainName === "codex" ? 2 : 0;
    let brainParsed: ReturnType<typeof SpanishBrainOutputSchema.safeParse> | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const parsed = safeJsonParse(raw);
      brainParsed = SpanishBrainOutputSchema.safeParse(parsed);
      if (brainParsed.success) break;

      insertSpanishTurn(db, {
        session_id: sessionId,
        idx: nextSpanishTurnIdx(db, sessionId),
        role: "assistant",
        kind: "brain_raw",
        content: raw,
        json: { brain: brainName, attempt, error: brainParsed.error?.issues?.[0]?.message ?? "schema_validation_failed" },
      });

      if (attempt >= maxRetries) {
        return { ok: false, error: "bad_brain_output", raw };
      }

      const threadId = currentRun.thread_id;
      if (!threadId) {
        return { ok: false, error: "missing_thread_id", raw };
      }

      const logDir = path.join(stateDir, "spanish", brainName, sessionId);
      fs.mkdirSync(logDir, { recursive: true });

      const runner = createBrainRunner(brainName);
      const retry = await runner.run({
        cwd: repoRootFromHere(),
        prompt: spanishRepairPrompt({ lane, badOutput: raw, attempt: attempt + 1 }),
        resumeThreadId: threadId,
        timeoutMs: 90_000,
        logJsonlPath: path.join(logDir, `repair-${Date.now()}-attempt${attempt + 1}.jsonl`),
      });

      if (!retry.ok) {
        insertSpanishTurn(db, {
          session_id: sessionId,
          idx: nextSpanishTurnIdx(db, sessionId),
          role: "assistant",
          kind: "error",
          content: `Brain (${brainName}) failed during repair: ${retry.error}`,
          json: retry,
        });
        return { ok: false, error: "brain_failed" };
      }

      currentRun = retry;
      raw = String(currentRun.last_agent_message ?? "").trim();
    }

    if (!brainParsed?.success) {
      // Defensive: should have returned above.
      return { ok: false, error: "bad_brain_output", raw };
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
        try {
          const tts = await renderTts({
            text: spoken,
            voice: tr.args.voice,
            rate: tr.args.rate,
            sanitizerVersion: TTS_SANITIZER_VERSION,
          });
          const result = {
            id: tr.id,
            tool: "speak",
            audio_id: tts.audio_id,
            url: `/api/audio/${tts.audio_id}`,
            duration_sec: tts.duration_sec,
          };
          speakResults.push(result);
          insertSpanishTurn(db, {
            session_id: sessionId,
            idx: nextSpanishTurnIdx(db, sessionId),
            role: "tool",
            kind: "tool_result",
            json: result,
          });
          wsBroadcast({ type: "spanish.tool", session_id: sessionId, event: "tool_result", tool: "speak", result });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          insertSpanishTurn(db, {
            session_id: sessionId,
            idx: nextSpanishTurnIdx(db, sessionId),
            role: "system",
            kind: "error",
            content: `speak failed: ${msg}`.slice(0, 4000),
          });
          wsBroadcast({ type: "spanish.tool", session_id: sessionId, event: "tool_error", tool: "speak", error: msg });
        }
      }
      if (tr.tool === "listen") {
        pendingListen = { id: tr.id, tool: "listen", target_text: tr.args.target_text };
        updateSpanishSession(db, sessionId, { pending_tool_json: JSON.stringify(tr) });
        wsBroadcast({ type: "spanish.tool", session_id: sessionId, event: "tool_pending", tool: "listen", args: pendingListen });
      }
    }

    // If the brain indicates it's done, auto-close the session as "completed".
    // UI clients treat this as a terminal state and should clear local input state.
    let sessionStatus: "open" | "completed" = "open";
    if (brain.await === "done") {
      const sess = getSpanishSession(db, sessionId);
      // Only record completion once, on the open -> completed transition.
      if (sess && sess.status === "open") {
        recordSpanishPracticeCompleted(db, sess, { status: "completed", auto: true, score: brain.score ?? null });
      }
      sessionStatus = "completed";
      updateSpanishSession(db, sessionId, { status: "completed", pending_tool_json: null });
      insertSpanishTurn(db, {
        session_id: sessionId,
        idx: nextSpanishTurnIdx(db, sessionId),
        role: "system",
        kind: "session_end",
        content: null,
        json: { status: "completed", auto: true },
      });
      wsBroadcast({ type: "spanish.session", event: "ended", session_id: sessionId, status: "completed" });
    }

    return { ok: true, brain, speakResults, pendingListen, session_status: sessionStatus };
  }

  async function startSpanishSessionFromCardPrompt(
    db: ReturnType<typeof openCoreDb>["db"],
    args: {
      source: "break_menu" | "srs_due";
      event_key: string | null;
      lane: string | null;
      card_id: number | null;
      card_key: string | null;
      card_prompt: string;
    },
  ): Promise<
    | {
        ok: true;
        session_id: string;
        thread_id: string | null;
        brain_name: BrainName;
        brain: SpanishBrainOutput;
        speak_results: any[];
        pending_listen: any | null;
        session_status: "open" | "completed";
      }
    | { ok: false; error: string; details?: any; session_id?: string; raw?: string }
  > {
    const brainName = normalizeBrainName(getSetting(db, "spanish_brain"));
    const sessionId = makeSpanishId("sp_sess");

    insertSpanishSession(db, {
      id: sessionId,
      status: "open",
      source: args.source,
      event_key: args.event_key,
      lane: args.lane,
      card_id: args.card_id,
      card_key: args.card_key,
      card_prompt: args.card_prompt,
      codex_thread_id: null,
      brain_name: brainName,
      brain_thread_id: null,
      pending_tool_json: null,
      meta_json: JSON.stringify({ v: 1 }),
    });

    wsBroadcast({ type: "spanish.session", event: "started", session_id: sessionId, brain_name: brainName });

    const system = spanishSystemPrompt(args.lane);
    const userPrompt = `CARD_PROMPT:\n${args.card_prompt}\n`;
    const promptForLog = `${system}\n\n${userPrompt}`;
    insertSpanishTurn(db, {
      session_id: sessionId,
      idx: nextSpanishTurnIdx(db, sessionId),
      role: "system",
      kind: "prompt",
      content: promptForLog,
    });

    const logDir = path.join(stateDir, "spanish", brainName, sessionId);
    fs.mkdirSync(logDir, { recursive: true });

    const runner = createBrainRunner(brainName);
    const run = await runner.run({
      cwd: repoRootFromHere(),
      prompt: userPrompt,
      systemPrompt: system,
      timeoutMs: 120_000,
      logJsonlPath: path.join(logDir, "turn0.jsonl"),
    });

    if (!run.ok) {
      insertSpanishTurn(db, {
        session_id: sessionId,
        idx: nextSpanishTurnIdx(db, sessionId),
        role: "assistant",
        kind: "error",
        content: `Brain (${brainName}) failed: ${run.error}`,
        json: run,
      });
      return { ok: false, error: "brain_failed", details: run, session_id: sessionId };
    }

    updateSpanishSession(db, sessionId, {
      // Keep legacy field only for Codex sessions. Claude sessions use brain_thread_id.
      codex_thread_id: brainName === "codex" ? run.thread_id : null,
      brain_name: brainName,
      brain_thread_id: run.thread_id,
    });

    const processed = await processBrainResponse(db, sessionId, run);
    if (!processed.ok) return { ok: false, error: processed.error, session_id: sessionId, raw: processed.raw };

    return {
      ok: true,
      session_id: sessionId,
      thread_id: run.thread_id,
      brain_name: brainName,
      brain: processed.brain,
      speak_results: processed.speakResults,
      pending_listen: processed.pendingListen,
      session_status: processed.session_status,
    };
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
    "spanish.brain.get": {
      description: "Get the default brain for new Spanish sessions.",
      schema: z.object({}),
      async handler() {
        const { db } = openCoreDb();
        try {
          const val = normalizeBrainName(getSetting(db, "spanish_brain"));
          return { ok: true, brain: val };
        } finally {
          db.close();
        }
      },
    },
    "spanish.brain.set": {
      description: "Set the default brain for new Spanish sessions.",
      schema: z.object({ brain: z.enum(["codex", "claude"]) }),
      async handler(payload) {
        const { db } = openCoreDb();
        try {
          setSetting(db, "spanish_brain", payload.brain);
          return { ok: true, brain: payload.brain };
        } finally {
          db.close();
        }
      },
    },
    "spanish.srs.due": {
      description: "Get due-now SRS counts for Spanish lanes (verb/noun/lesson).",
      schema: z.object({}),
      async handler() {
        const { db } = openCoreDb();
        try {
          const nowUnix = Math.floor(Date.now() / 1000);
          const lanes = {
            verb: countDueSrsCards(db, { moduleSlug: "spanish", lane: "verb", nowUnix }),
            noun: countDueSrsCards(db, { moduleSlug: "spanish", lane: "noun", nowUnix }),
            lesson: countDueSrsCards(db, { moduleSlug: "spanish", lane: "lesson", nowUnix }),
          };
          return { ok: true, now_unix: nowUnix, lanes };
        } finally {
          db.close();
        }
      },
    },
    "spanish.session.start_due": {
      description: "Start a Spanish session from the due SRS queue (bypasses break menu).",
      schema: z.object({ lane: z.enum(["verb", "noun", "lesson"]) }),
      async handler(payload) {
        const { db } = openCoreDb();
        try {
          const nowUnix = Math.floor(Date.now() / 1000);
          const due = listDueSrsCards(db, { moduleSlug: "spanish", lane: payload.lane, nowUnix, limit: 1 })[0] ?? null;
          if (!due) return { ok: false, error: "no_due_cards" };

          const row = db.prepare("SELECT id, key, prompt FROM cards WHERE id = ? LIMIT 1").get(due.card_id) as
            | { id: number; key: string; prompt: string | null }
            | undefined;
          if (!row) return { ok: false, error: "card_not_found", card_id: due.card_id };

          const cardPrompt = String(row.prompt ?? "").trim();
          if (!cardPrompt) return { ok: false, error: "missing_card_prompt", card_id: row.id, card_key: row.key };
          const started = await startSpanishSessionFromCardPrompt(db, {
            source: "srs_due",
            event_key: null,
            lane: payload.lane,
            card_id: row.id,
            card_key: row.key,
            card_prompt: cardPrompt,
          });
          if (!started.ok) return started;

          return {
            ...started,
            picked: {
              card_id: due.card_id,
              card_key: due.card_key,
              lane: payload.lane,
              box: due.box,
              due_at_unix: due.due_at_unix,
            },
          };
        } finally {
          db.close();
        }
      },
    },
    "spanish.session.start": {
      description: "Start a Spanish tutoring session driven by a brain (Codex or Claude).",
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
          return await startSpanishSessionFromCardPrompt(db, {
            source: "break_menu",
            event_key: payload.event_key ?? null,
            lane: payload.lane ?? null,
            card_id: payload.card_id ?? null,
            card_key: payload.card_key ?? null,
            card_prompt: payload.card_prompt,
          });
        } finally {
          db.close();
        }
      },
    },
    "spanish.session.answer": {
      description: "Submit a typed answer to an existing Spanish session.",
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
          const threadId = sess.brain_thread_id ?? sess.codex_thread_id;
          if (!threadId) return { ok: false, error: "missing_thread_id" };
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
          const brainName: BrainName = normalizeBrainName(sess.brain_name);
          const logDir = path.join(stateDir, "spanish", brainName, payload.session_id);
          fs.mkdirSync(logDir, { recursive: true });

          const runner = createBrainRunner(brainName);
          const run = await runner.run({
            cwd: repoRootFromHere(),
            prompt: followup,
            resumeThreadId: threadId,
            timeoutMs: 120_000,
            logJsonlPath: path.join(logDir, `turn${Date.now()}.jsonl`),
          });
          if (!run.ok) {
            insertSpanishTurn(db, {
              session_id: payload.session_id,
              idx: nextSpanishTurnIdx(db, payload.session_id),
              role: "assistant",
              kind: "error",
              content: `Brain (${brainName}) failed: ${run.error}`,
              json: run,
            });
            return { ok: false, error: "brain_failed", details: run };
          }

          updateSpanishSession(db, payload.session_id, { pending_tool_json: null });
          const processed = await processBrainResponse(db, payload.session_id, run);
          if (!processed.ok) return { ok: false, error: processed.error, raw: processed.raw };

          return {
            ok: true,
            brain: processed.brain,
            speak_results: processed.speakResults,
            pending_listen: processed.pendingListen,
            session_status: processed.session_status,
          };
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
          if (sess.status !== "open") {
            // Idempotent: don't record completion twice.
            return { ok: true, already_ended: true, status: sess.status };
          }

          // Best-effort: extract the most recent brain score so SRS outcomes can be score-aware.
          // (If missing/unparseable, we'll fall back to status-only outcomes.)
          let score: { correct: number; total: number } | null = null;
          try {
            const row = db
              .prepare(
                `SELECT json
                 FROM spanish_turns
                 WHERE session_id = ? AND kind = 'brain_output'
                 ORDER BY idx DESC
                 LIMIT 1`,
              )
              .get(payload.session_id) as { json: string | null } | undefined;
            if (row?.json) {
              const parsed = JSON.parse(row.json) as any;
              const s = parsed?.score;
              if (s && Number.isFinite(s.correct) && Number.isFinite(s.total)) {
                const correct = Math.max(0, Math.trunc(Number(s.correct)));
                const total = Math.max(0, Math.trunc(Number(s.total)));
                if (total > 0) score = { correct, total };
              }
            }
          } catch {
            // ignore
          }

          recordSpanishPracticeCompleted(db, sess, { status: payload.status, note: payload.note ?? null, auto: false, score });
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
    "sovt.play": {
      description: "Run a `site-toggle play ... --json` command (non-sudo). Used by the browser SOVT runner.",
      schema: z.object({ args: z.array(z.string().min(1)).min(1).max(64) }),
      async handler(payload) {
        const args = payload.args.map(String);
        if (args[0] !== "play") return { ok: false, error: "only_play_supported" };
        const finalArgs = args.includes("--json") ? args : [...args, "--json"];
        const res = await runSiteToggle(finalArgs);
        if (!res.ok) return { ok: false, error: res.error, details: res.details };
        return res.result;
      },
    },
    "sovt.pitch.save": {
      description: "Persist a pitch check result (numeric summary + per-note JSON).",
      schema: z.object({
        card_id: z.number().int().positive().optional(),
        event_key: z.string().min(1).optional(),
        step_idx: z.number().int().positive().optional(),
        step_title: z.string().min(1).max(200).optional(),
        offset_ms: z.number().int().optional(),
        auto_offset_ms: z.number().int().optional(),
        duration_ms: z.number().int().positive(),
        ok_ratio: z.number().min(0).max(1),
        note_count: z.number().int().nonnegative(),
        ok_count: z.number().int().nonnegative(),
        contour_points: z.number().int().nonnegative(),
        per_note: z.array(z.unknown()).max(2000),
      }),
      async handler(payload) {
        const { db } = openCoreDb();
        try {
          const id = makeId("pitch");
          insertPitchResult(db, {
            id,
            cardId: payload.card_id ?? null,
            eventKey: payload.event_key ?? null,
            stepIdx: payload.step_idx ?? null,
            stepTitle: payload.step_title ?? null,
            offsetMs: typeof payload.offset_ms === "number" ? payload.offset_ms : null,
            autoOffsetMs: typeof payload.auto_offset_ms === "number" ? payload.auto_offset_ms : null,
            durationMs: payload.duration_ms,
            okRatio: payload.ok_ratio,
            noteCount: payload.note_count,
            okCount: payload.ok_count,
            contourPoints: payload.contour_points,
            perNoteJson: JSON.stringify(payload.per_note),
          });
          return { ok: true, id };
        } finally {
          db.close();
        }
      },
    },
    "sovt.pitch.history": {
      description: "List recent pitch check results.",
      schema: z.object({ limit: z.number().int().min(1).max(200).optional() }),
      async handler(payload) {
        const { db } = openCoreDb();
        try {
          const rows = listPitchResults(db, { limit: payload.limit ?? 10 });
          return { ok: true, results: rows };
        } finally {
          db.close();
        }
      },
    },
    "sovt.complete": {
      description: "Mark a chosen SOVT card as completed/partial/abandoned (module tracking).",
      schema: z.object({
        event_key: z.string().min(1),
        card_id: z.number().int().positive(),
        status: z.enum(["completed", "partial", "abandoned"]),
        parts: z.array(z.string()).optional(),
        note: z.string().optional(),
      }),
      async handler(payload) {
        const { db } = openCoreDb();
        try {
          insertEvent(db, {
            type: "practice_completed",
            eventKey: payload.event_key,
            cardId: payload.card_id,
            metaJson: JSON.stringify({
              module_slug: "sovt",
              status: payload.status,
              parts: payload.parts ?? [],
              note: payload.note ?? null,
            }),
          });
          return {
            ok: true,
            module: { slug: "sovt", name: "SOVT / Pitch" },
            action: "complete",
            session: { event_key: payload.event_key, card_id: payload.card_id, status: payload.status },
          };
        } finally {
          db.close();
        }
      },
    },
  };

  const app = new Hono();
  let runtimePort = 0;

  app.get("/api/status", (c) => {
    // Token is required for /api/action and /ws, but we avoid returning it in the JSON body
    // so it doesn't end up in debug prints / logs by accident.
    c.header("x-cb-token", token);
    c.header("cache-control", "no-store");
    return c.json({
      ok: true,
      pid: process.pid,
      started_at: startedAt,
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
      const threadId = sess.brain_thread_id ?? sess.codex_thread_id;
      if (!threadId) return c.json({ ok: false, error: "missing_thread_id" }, 400);
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
      const brainName: BrainName = normalizeBrainName(sess.brain_name);
      const logDir = path.join(stateDir, "spanish", brainName, sessionId);
      fs.mkdirSync(logDir, { recursive: true });

      const runner = createBrainRunner(brainName);
      const run = await runner.run({
        cwd: repoRootFromHere(),
        prompt: followup,
        resumeThreadId: threadId,
        timeoutMs: 120_000,
        logJsonlPath: path.join(logDir, `listen-${uploadId}.jsonl`),
      });

      if (!run.ok) {
        insertSpanishTurn(db, { session_id: sessionId, idx: nextSpanishTurnIdx(db, sessionId), role: "assistant", kind: "error", content: `Brain (${brainName}) failed: ${run.error}`, json: run });
        return c.json({ ok: false, error: "brain_failed", details: run }, 500);
      }

      const processed = await processBrainResponse(db, sessionId, run);
      if (!processed.ok) return c.json({ ok: false, error: processed.error, raw: processed.raw }, 500);

      return c.json({
        ok: true,
        upload_id: uploadId,
        analysis,
        brain: processed.brain,
        speak_results: processed.speakResults,
        pending_listen: processed.pendingListen,
        session_status: processed.session_status,
      });
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
	        // Assign a stable ID for cleanup of per-WS run-lines sessions.
	        wsIds.set(ws, makeId("ws"));

	        wsClients.add(ws);
	        ws.send(JSON.stringify({ type: "server.state", now: new Date().toISOString() }));
	        ws.send(JSON.stringify({ type: "agent.signals.snapshot", signals }));
	      },
	      close(ws) {
	        wsClients.delete(ws);

	        const wsId = wsIds.get(ws) ?? null;
	        wsIds.delete(ws);
	        if (!wsId) return;

	        // Cleanup any in-memory run-lines sessions owned by this connection.
	        for (const [id, s] of sessions) {
	          if (s.owner_ws_id !== wsId) continue;
	          sessions.delete(id);
          recordRunLinesPracticeEvent(s, "disconnected");
        }
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
	          const nowMs = Date.now();
	          const wsId = wsIds.get(ws) ?? "ws_unknown";

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
                  ? "practice"
                  : "practice";

          const speedFromMode = parsedMode === "speed_through" ? 1.3 : 1.0;
          const revealAfter =
            typeof msg.reveal_after === "boolean"
              ? msg.reveal_after
              : // Back-compat: older UI clients didn't send reveal_after; previous behavior always revealed.
                rawMode === "practice" || rawMode === "learn";
          const session: RunLinesSession = {
            id: sessionId,
            owner_ws_id: wsId,
            created_at_ms: nowMs,
            last_activity_ms: nowMs,
            play_started_ms: null,
            last_emitted_idx: null,
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
            reveal_after: revealAfter,
            speed_mult: Number(msg.speed_mult ?? speedFromMode),
            playing: false,
            pending_self_line: null,
            event_seq: 0,
            idx: 0,
            prefetch_in_flight: false,
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
          session.last_activity_ms = Date.now();
          if (session.play_started_ms === null) session.play_started_ms = Date.now();
          const res = await emitNextRunLineEvent(ws, session);
          if (res.ended) {
            sessions.delete(sessionId);
            recordRunLinesPracticeEvent(session, "completed");
          }
          return;
        }

        if (msg?.type === "run_lines.ack") {
          const sessionId = String(msg.session_id ?? "");
          const session = sessions.get(sessionId);
          if (!session) return;
          if (!session.playing) return;
          session.last_activity_ms = Date.now();
          const res = await emitNextRunLineEvent(ws, session);
          if (res.ended) {
            sessions.delete(sessionId);
            recordRunLinesPracticeEvent(session, "completed");
          }
          return;
        }

        if (msg?.type === "run_lines.stop") {
          const sessionId = String(msg.session_id ?? "");
          const session = sessions.get(sessionId);
          if (!session) return;
          sessions.delete(sessionId);
          recordRunLinesPracticeEvent(session, "stopped");
          ws.send(JSON.stringify({ type: "run_lines.session", event: "ended", session_id: sessionId }));
          return;
        }

        if (msg?.type === "run_lines.set_speed") {
          const sessionId = String(msg.session_id ?? "");
          const session = sessions.get(sessionId);
          if (!session) return;
          const speed = Number(msg.speed_mult ?? 1.0);
          session.speed_mult = Number.isFinite(speed) && speed > 0 ? speed : 1.0;
          session.last_activity_ms = Date.now();
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
          session.last_activity_ms = Date.now();
          session.last_emitted_idx = null;

          ws.send(JSON.stringify({ type: "run_lines.session", event: "seeked", session_id: sessionId, from, to }));
          if (session.playing) {
            const res = await emitNextRunLineEvent(ws, session);
            if (res.ended) {
              sessions.delete(sessionId);
              recordRunLinesPracticeEvent(session, "completed");
            }
          }
          return;
        }

        if (msg?.type === "run_lines.jump") {
          const sessionId = String(msg.session_id ?? "");
          const session = sessions.get(sessionId);
          if (!session) return;

          const rawTarget = Number(msg.target_idx ?? NaN);
          if (!Number.isFinite(rawTarget)) return;

          // Jump only moves the cursor within the already-loaded session range.
          // It does NOT change the session's from/to boundaries or reload lines.
          const targetIdx = clamp(session.from, session.to, rawTarget);
          const nextPos = session.lines.findIndex((l) => l.idx >= targetIdx);
          session.idx = nextPos >= 0 ? nextPos : session.lines.length;
          session.pending_self_line = null;
          session.last_activity_ms = Date.now();

          ws.send(JSON.stringify({ type: "run_lines.session", event: "jumped", session_id: sessionId, target_idx: targetIdx }));
          if (session.playing) {
            const res = await emitNextRunLineEvent(ws, session);
            if (res.ended) {
              sessions.delete(sessionId);
              recordRunLinesPracticeEvent(session, "completed");
            }
          }
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

async function prefetchNextRunLineTts(session: RunLinesSession): Promise<void> {
  if (session.prefetch_in_flight) return;
  session.prefetch_in_flight = true;

  try {
    const startIdx = Math.max(0, session.idx);
    let prefetched = 0;

    for (let i = startIdx; i < session.lines.length && prefetched < 3; i += 1) {
      const l = session.lines[i];
      if (!l) continue;
      if (l.type !== "dialogue") continue;

      const speaker = (l.speaker_normalized ?? "").trim();
      const spoken = sanitizeTtsText(l.text);
      if (!spoken) continue;

      const isMe = !session.read_all && speaker && speaker === session.me_norm;
      const needsAudio =
        session.mode === "read_through"
          ? true
          : isMe
            ? session.reveal_after
            : session.mode !== "speed_through";
      if (!needsAudio) continue;

      const ch = session.characters.find((c) => c.normalized_name === speaker) ?? null;
      const voice = ch?.voice ?? "en-US-GuyNeural";
      const rate = ch?.rate ?? "+0%";

      // Prefetch sequentially to avoid bursts. Best-effort: ignore failures.
      try {
        await renderTts({ text: spoken, voice, rate, sanitizerVersion: TTS_SANITIZER_VERSION });
      } catch {
        // ignore
      }
      prefetched += 1;
    }
  } finally {
    session.prefetch_in_flight = false;
  }
}

async function emitNextRunLineEvent(ws: any, session: RunLinesSession): Promise<{ ended: boolean }> {
  session.last_activity_ms = Date.now();

  if (session.pending_self_line) {
    const p = session.pending_self_line;
    session.pending_self_line = null;
    session.last_emitted_idx = p.idx;
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
    void prefetchNextRunLineTts(session);
    return { ended: false };
  }

  while (session.idx < session.lines.length) {
    const l = session.lines[session.idx];
    session.idx += 1;
    if (!l) continue;

    if (l.type !== "dialogue") {
      session.last_emitted_idx = l.idx;
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
      return { ended: false };
    }

    const speaker = (l.speaker_normalized ?? "").trim();
    const spoken = sanitizeTtsText(l.text);
    if (!spoken) continue;

    const speed = clamp(0.5, 3.0, session.speed_mult);
    const isMe = !session.read_all && speaker && speaker === session.me_norm;

    // Silent mode: don't render TTS for other characters; just wait.
    if (session.mode === "speed_through" && !isMe) {
      const gapSec = clamp(session.pause_min_sec, session.pause_max_sec, estimatedSpeakSeconds(spoken) / speed);
      session.last_emitted_idx = l.idx;
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
      return { ended: false };
    }

    const ch = session.characters.find((c) => c.normalized_name === speaker) ?? null;
    const voice = ch?.voice ?? "en-US-GuyNeural";
    const rate = ch?.rate ?? "+0%";

    if (isMe && session.mode !== "read_through") {
      // Your line: pause for you to speak it. Optionally reveal after.
      let baseSeconds = estimatedSpeakSeconds(spoken);
      let tts: Awaited<ReturnType<typeof renderTts>> | null = null;
      if (session.reveal_after) {
        try {
          tts = await renderTts({ text: spoken, voice, rate, sanitizerVersion: TTS_SANITIZER_VERSION });
          baseSeconds = tts.duration_sec;
        } catch {
          // If reveal fails, degrade to practice pause (no reveal).
          tts = null;
          baseSeconds = estimatedSpeakSeconds(spoken);
        }
      }

      const pauseSec = clamp(session.pause_min_sec, session.pause_max_sec, (baseSeconds * session.pause_mult) / speed);
      if (tts && session.reveal_after) {
        session.pending_self_line = {
          idx: l.idx,
          speaker: speaker || null,
          text: l.text,
          audio_id: tts.audio_id,
          duration_sec: tts.duration_sec,
        };
      } else {
        session.pending_self_line = null;
      }

      session.last_emitted_idx = l.idx;
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
      void prefetchNextRunLineTts(session);
      return { ended: false };
    }

    // Other characters (or read-through): speak via TTS. If it fails, degrade to a timed gap.
    try {
      const tts = await renderTts({ text: spoken, voice, rate, sanitizerVersion: TTS_SANITIZER_VERSION });
      session.last_emitted_idx = l.idx;
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
      void prefetchNextRunLineTts(session);
      return { ended: false };
    } catch {
      const gapSec = clamp(session.pause_min_sec, session.pause_max_sec, estimatedSpeakSeconds(spoken) / speed);
      session.last_emitted_idx = l.idx;
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
      return { ended: false };
    }
  }

  session.playing = false;
  ws.send(JSON.stringify({ type: "run_lines.session", event: "ended", session_id: session.id }));
  return { ended: true };
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
