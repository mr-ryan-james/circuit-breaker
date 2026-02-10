import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { applySchema } from "@circuit-breaker/core";
import { bunDbAdapter } from "@circuit-breaker/shared-sqlite";
import { Database } from "bun:sqlite";

import { ensureActingSchema } from "../src/actingDb.js";
import { ensureSpanishSchema } from "../src/spanishDb.js";

type UiServerStateV1 = {
  version: 1;
  pid: number;
  port: number;
  started_at: string;
  ui_url: string;
  ws_url: string;
  token: string;
  log_path: string;
};

function repoRootFromHere(): string {
  return path.resolve(import.meta.dir, "../../..");
}

function mkdtemp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForState(statePath: string, timeoutMs = 8000): Promise<UiServerStateV1> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const raw = fs.readFileSync(statePath, "utf8");
      const parsed = JSON.parse(raw) as UiServerStateV1;
      if (parsed && parsed.version === 1 && parsed.port && parsed.token) return parsed;
    } catch {
      // ignore
    }
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ui-server state at ${statePath}`);
}

function openCoreDbForTest(dbPath: string): { raw: Database; db: ReturnType<typeof bunDbAdapter> } {
  const raw = new Database(dbPath);
  const db = bunDbAdapter(raw);
  applySchema(db);
  ensureSpanishSchema(db);
  return { raw, db };
}

function resetCoreDb(dbPath: string): void {
  const { raw, db } = openCoreDbForTest(dbPath);
  try {
    // Keep this focused on the tables these tests touch.
    db.exec("DELETE FROM events");
    db.exec("DELETE FROM card_srs");
    db.exec("DELETE FROM cards");
    db.exec("DELETE FROM spanish_turns");
    db.exec("DELETE FROM spanish_sessions");
    db.exec("DELETE FROM settings");
  } finally {
    raw.close();
  }
}

function seedCard(dbPath: string, args: { id: number; key: string; prompt: string }): void {
  const { raw, db } = openCoreDbForTest(dbPath);
  try {
    db.prepare(
      `INSERT INTO cards (id, key, category, minutes, activity, done_condition, prompt, location, rarity, tags_json, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(args.id, args.key, "learning", 5, "TEST", "DONE", args.prompt, "any", "common", "[]", 1);
  } finally {
    raw.close();
  }
}

function seedDueSrs(dbPath: string, args: { cardId: number; lane: "verb" | "noun" | "lesson"; box: number; dueAtUnix: number }): void {
  const { raw, db } = openCoreDbForTest(dbPath);
  try {
    db.prepare(
      `INSERT INTO card_srs (card_id, module_slug, lane, box, due_at_unix)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(card_id, module_slug, lane) DO UPDATE SET box=excluded.box, due_at_unix=excluded.due_at_unix`,
    ).run(args.cardId, "spanish", args.lane, args.box, args.dueAtUnix);
  } finally {
    raw.close();
  }
}

function getSrsBox(dbPath: string, args: { cardId: number; lane: "verb" | "noun" | "lesson" }): number | null {
  const { raw, db } = openCoreDbForTest(dbPath);
  try {
    const row = db
      .prepare(`SELECT box FROM card_srs WHERE card_id = ? AND module_slug = 'spanish' AND lane = ? LIMIT 1`)
      .get(args.cardId, args.lane) as { box?: number } | undefined;
    const box = Number(row?.box ?? NaN);
    return Number.isFinite(box) ? box : null;
  } finally {
    raw.close();
  }
}

function getLatestPracticeCompletedMeta(dbPath: string, cardId: number): any | null {
  const { raw, db } = openCoreDbForTest(dbPath);
  try {
    const row = db
      .prepare(
        `SELECT meta_json
         FROM events
         WHERE type = 'practice_completed' AND card_id = ?
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get(cardId) as { meta_json?: string | null } | undefined;
    const metaRaw = row?.meta_json ?? null;
    if (!metaRaw) return null;
    try {
      return JSON.parse(metaRaw);
    } catch {
      return null;
    }
  } finally {
    raw.close();
  }
}

function getSpanishSessionSource(dbPath: string, sessionId: string): string | null {
  const { raw, db } = openCoreDbForTest(dbPath);
  try {
    const row = db
      .prepare(`SELECT source FROM spanish_sessions WHERE id = ? LIMIT 1`)
      .get(sessionId) as { source?: string } | undefined;
    return row?.source ?? null;
  } finally {
    raw.close();
  }
}

async function callAction(state: UiServerStateV1, action: string, payload: any): Promise<any> {
  const res = await fetch(`http://127.0.0.1:${state.port}/api/action`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cb-token": state.token,
    },
    body: JSON.stringify({ v: 1, action, payload }),
  });
  return res.json();
}

let proc: ReturnType<typeof Bun.spawn> | null = null;
let state: UiServerStateV1 | null = null;
let tmpDir: string | null = null;
let coreDbPath: string | null = null;

beforeAll(async () => {
  tmpDir = mkdtemp("cb-ui-server-spanish-test-");
  const stateDir = path.join(tmpDir, "state");
  const statePath = path.join(stateDir, "state.json");

  coreDbPath = path.join(tmpDir, "core.db");
  const actingDbPath = path.join(tmpDir, "acting.db");

  // Create a valid acting DB path so the server can open it if needed.
  {
    const raw = new Database(actingDbPath);
    const db = bunDbAdapter(raw);
    ensureActingSchema(db);
    raw.close();
  }

  const repoRoot = repoRootFromHere();
  proc = Bun.spawn(["bun", "run", "src/server.ts", "--port", "0", "--state-dir", stateDir, "--dev"], {
    cwd: path.join(repoRoot, "packages", "ui-server"),
    env: {
      ...process.env,
      CIRCUIT_BREAKER_DB_PATH: coreDbPath,
      CIRCUIT_BREAKER_ACTING_DB_PATH: actingDbPath,
      CIRCUIT_BREAKER_BRAIN_MODE: "mock",
      CIRCUIT_BREAKER_MOCK_BRAIN_OUTPUT_JSON_KIND_USER_ANSWER: JSON.stringify({
        v: 1,
        assistant_text: "ok",
        tool_requests: [],
        await: "done",
        score: { correct: 3, total: 3 },
      }),
    },
    stdout: "ignore",
    stderr: "ignore",
  });

  state = await waitForState(statePath);
});

afterAll(() => {
  try {
    proc?.kill("SIGTERM");
  } catch {
    // ignore
  }
  proc = null;
  state = null;

  try {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
  tmpDir = null;
  coreDbPath = null;
});

beforeEach(() => {
  if (!coreDbPath) throw new Error("missing coreDbPath");
  resetCoreDb(coreDbPath);
});

test("spanish: start_due returns no_due_cards when lane has no due rows", async () => {
  if (!state) throw new Error("missing state");
  const res = await callAction(state, "spanish.session.start_due", { lane: "verb" });
  expect(res.ok).toBe(false);
  expect(res.error).toBe("no_due_cards");
});

test("spanish: start_due returns picked metadata and session has source=srs_due", async () => {
  if (!state) throw new Error("missing state");
  if (!coreDbPath) throw new Error("missing coreDbPath");

  const nowUnix = Math.floor(Date.now() / 1000);
  seedCard(coreDbPath, { id: 100, key: "learning.spanish.verb.test.v1", prompt: "MOCK_BRAIN_OUTPUT_JSON: {\"v\":1,\"assistant_text\":\"ok\",\"tool_requests\":[],\"await\":\"done\"}" });
  seedDueSrs(coreDbPath, { cardId: 100, lane: "verb", box: 1, dueAtUnix: nowUnix - 10 });

  const res = await callAction(state, "spanish.session.start_due", { lane: "verb" });
  expect(res.ok).toBe(true);
  expect(res.picked?.card_id).toBe(100);
  expect(res.picked?.lane).toBe("verb");
  expect(typeof res.session_id).toBe("string");

  const source = getSpanishSessionSource(coreDbPath, String(res.session_id));
  expect(source).toBe("srs_due");
});

test("spanish: score-aware failure resets SRS box to 1", async () => {
  if (!state) throw new Error("missing state");
  if (!coreDbPath) throw new Error("missing coreDbPath");

  const nowUnix = Math.floor(Date.now() / 1000);
  seedCard(coreDbPath, {
    id: 101,
    key: "learning.spanish.verb.fail.v1",
    prompt:
      "MOCK_BRAIN_OUTPUT_JSON: {\"v\":1,\"assistant_text\":\"fail\",\"tool_requests\":[],\"await\":\"done\",\"score\":{\"correct\":0,\"total\":3}}",
  });
  seedDueSrs(coreDbPath, { cardId: 101, lane: "verb", box: 3, dueAtUnix: nowUnix - 10 });

  const res = await callAction(state, "spanish.session.start_due", { lane: "verb" });
  expect(res.ok).toBe(true);

  const box = getSrsBox(coreDbPath, { cardId: 101, lane: "verb" });
  expect(box).toBe(1);

  const meta = getLatestPracticeCompletedMeta(coreDbPath, 101);
  expect(meta?.outcome).toBe("failure");
  expect(meta?.score?.total).toBe(3);
});

test("spanish: score-aware success advances SRS box", async () => {
  if (!state) throw new Error("missing state");
  if (!coreDbPath) throw new Error("missing coreDbPath");

  const nowUnix = Math.floor(Date.now() / 1000);
  seedCard(coreDbPath, {
    id: 102,
    key: "learning.spanish.verb.success.v1",
    prompt:
      "MOCK_BRAIN_OUTPUT_JSON: {\"v\":1,\"assistant_text\":\"success\",\"tool_requests\":[],\"await\":\"done\",\"score\":{\"correct\":3,\"total\":3}}",
  });
  seedDueSrs(coreDbPath, { cardId: 102, lane: "verb", box: 1, dueAtUnix: nowUnix - 10 });

  const res = await callAction(state, "spanish.session.start_due", { lane: "verb" });
  expect(res.ok).toBe(true);

  const box = getSrsBox(coreDbPath, { cardId: 102, lane: "verb" });
  expect(box).toBe(2);

  const meta = getLatestPracticeCompletedMeta(coreDbPath, 102);
  expect(meta?.outcome).toBe("success");
  expect(meta?.score?.total).toBe(3);
});

test("spanish: srs.due counts match due-now rows", async () => {
  if (!state) throw new Error("missing state");
  if (!coreDbPath) throw new Error("missing coreDbPath");

  const nowUnix = Math.floor(Date.now() / 1000);
  seedCard(coreDbPath, { id: 110, key: "learning.spanish.verb.due.v1", prompt: "MOCK_BRAIN_OUTPUT_JSON: {\"v\":1,\"assistant_text\":\"ok\",\"tool_requests\":[],\"await\":\"done\"}" });
  seedCard(coreDbPath, { id: 111, key: "learning.spanish.noun.due.v1", prompt: "MOCK_BRAIN_OUTPUT_JSON: {\"v\":1,\"assistant_text\":\"ok\",\"tool_requests\":[],\"await\":\"done\"}" });
  seedCard(coreDbPath, { id: 112, key: "learning.spanish.lesson.not_due.v1", prompt: "MOCK_BRAIN_OUTPUT_JSON: {\"v\":1,\"assistant_text\":\"ok\",\"tool_requests\":[],\"await\":\"done\"}" });

  seedDueSrs(coreDbPath, { cardId: 110, lane: "verb", box: 1, dueAtUnix: nowUnix - 10 });
  seedDueSrs(coreDbPath, { cardId: 111, lane: "noun", box: 1, dueAtUnix: nowUnix - 10 });
  seedDueSrs(coreDbPath, { cardId: 112, lane: "lesson", box: 1, dueAtUnix: nowUnix + 60 * 60 }); // not due yet

  const res = await callAction(state, "spanish.srs.due", {});
  expect(res.ok).toBe(true);
  expect(res.lanes.verb).toBe(1);
  expect(res.lanes.noun).toBe(1);
  expect(res.lanes.lesson).toBe(0);
});

test("spanish: start_due await=user then answer completes and advances SRS", async () => {
  if (!state) throw new Error("missing state");
  if (!coreDbPath) throw new Error("missing coreDbPath");

  const nowUnix = Math.floor(Date.now() / 1000);
  seedCard(coreDbPath, {
    id: 120,
    key: "learning.spanish.verb.multiturn.v1",
    prompt:
      "MOCK_BRAIN_OUTPUT_JSON: {\"v\":1,\"assistant_text\":\"Type your answer\",\"tool_requests\":[],\"await\":\"user\"}",
  });
  seedDueSrs(coreDbPath, { cardId: 120, lane: "verb", box: 1, dueAtUnix: nowUnix - 10 });

  const started = await callAction(state, "spanish.session.start_due", { lane: "verb" });
  expect(started.ok).toBe(true);
  expect(started.session_status).toBe("open");
  expect(typeof started.session_id).toBe("string");

  const sessId = String(started.session_id);
  const answered = await callAction(state, "spanish.session.answer", { session_id: sessId, answer: "hola" });
  expect(answered.ok).toBe(true);
  expect(answered.session_status).toBe("completed");

  const box = getSrsBox(coreDbPath, { cardId: 120, lane: "verb" });
  expect(box).toBe(2);

  const meta = getLatestPracticeCompletedMeta(coreDbPath, 120);
  expect(meta?.outcome).toBe("success");
  expect(meta?.score?.total).toBe(3);
});
