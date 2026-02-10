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
    db.exec("DELETE FROM pitch_results");
    db.exec("DELETE FROM cards");
    db.exec("DELETE FROM card_srs");
    db.exec("DELETE FROM events");
    db.exec("DELETE FROM spanish_turns");
    db.exec("DELETE FROM spanish_sessions");
    db.exec("DELETE FROM settings");
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
  tmpDir = mkdtemp("cb-ui-server-pitch-test-");
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

test("pitch: save then history returns the saved id", async () => {
  if (!state) throw new Error("missing state");

  const saved = await callAction(state, "sovt.pitch.save", {
    duration_ms: 2000,
    ok_ratio: 0.5,
    note_count: 2,
    ok_count: 1,
    contour_points: 10,
    per_note: [{ idx: 1, note: "A3", ok: true }],
  });
  expect(saved.ok).toBe(true);
  expect(typeof saved.id).toBe("string");

  const hist = await callAction(state, "sovt.pitch.history", { limit: 10 });
  expect(hist.ok).toBe(true);
  expect(Array.isArray(hist.results)).toBe(true);
  expect(hist.results.length).toBeGreaterThan(0);
  expect(hist.results[0].id).toBe(saved.id);
});

