import { afterAll, beforeAll, expect, test } from "bun:test";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { bunDbAdapter } from "@circuit-breaker/shared-sqlite";
import { Database } from "bun:sqlite";

import { ensureActingSchema } from "../src/actingDb.js";

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

function seedActingDb(dbPath: string): void {
  const raw = new Database(dbPath);
  const db = bunDbAdapter(raw);
  ensureActingSchema(db);

  // Minimal script + characters + lines to exercise run-lines sequencing.
  db.prepare(
    `INSERT INTO scripts (id, title, source_format, source_text, parser_version)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(1, "Test Script", "plain", "test", 1);

  db.prepare(
    `INSERT INTO script_characters (script_id, name, normalized_name, voice, rate)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(1, "Melchior", "MELCHIOR", "en-US-GuyNeural", "+0%");

  db.prepare(
    `INSERT INTO script_characters (script_id, name, normalized_name, voice, rate)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(1, "Wendla", "WENDLA", "en-US-JennyNeural", "+0%");

  const ins = db.prepare(
    `INSERT INTO script_lines (script_id, idx, type, speaker_normalized, text, scene_number, scene_heading)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  ins.run(1, 1, "direction", null, "Lights up.", 1, "SCENE 1");
  ins.run(1, 2, "dialogue", "MELCHIOR", "Hello.", 1, "SCENE 1");
  ins.run(1, 3, "dialogue", "WENDLA", "Hi.", 1, "SCENE 1");
  ins.run(1, 4, "dialogue", "MELCHIOR", "Ok.", 1, "SCENE 1");
  ins.run(1, 5, "direction", null, "Blackout.", 1, "SCENE 1");

  raw.close();
}

type WsAny = any;

function makeWsClient(ws: WebSocket) {
  const queue: WsAny[] = [];

  ws.addEventListener("message", (evt) => {
    try {
      queue.push(JSON.parse(String(evt.data)));
    } catch {
      queue.push({ type: "error", scope: "test", message: "bad_json" });
    }
  });

  async function waitFor(predicate: (m: WsAny) => boolean, timeoutMs = 2000): Promise<WsAny> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const idx = queue.findIndex(predicate);
      if (idx >= 0) return queue.splice(idx, 1)[0]!;
      await sleep(10);
    }
    throw new Error("Timed out waiting for WS message");
  }

  return { waitFor };
}

let proc: ReturnType<typeof Bun.spawn> | null = null;
let state: UiServerStateV1 | null = null;
let tmpDir: string | null = null;

beforeAll(async () => {
  tmpDir = mkdtemp("cb-ui-server-test-");
  const stateDir = path.join(tmpDir, "state");
  const statePath = path.join(stateDir, "state.json");

  const coreDbPath = path.join(tmpDir, "core.db");
  const actingDbPath = path.join(tmpDir, "acting.db");
  seedActingDb(actingDbPath);

  const repoRoot = repoRootFromHere();
  proc = Bun.spawn(
    ["bun", "run", "src/server.ts", "--port", "0", "--state-dir", stateDir, "--dev"],
    {
      cwd: path.join(repoRoot, "packages", "ui-server"),
      env: {
        ...process.env,
        CIRCUIT_BREAKER_DB_PATH: coreDbPath,
        CIRCUIT_BREAKER_ACTING_DB_PATH: actingDbPath,
      },
      stdout: "ignore",
      stderr: "ignore",
    },
  );

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
  // Best-effort temp cleanup (not critical).
  try {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
  tmpDir = null;
});

function wsUrlWithToken(s: UiServerStateV1): string {
  const url = new URL(s.ws_url);
  url.searchParams.set("token", s.token);
  return url.toString();
}

test("run-lines: start -> play -> events -> end", async () => {
  if (!state) throw new Error("missing state");

  const ws = new WebSocket(wsUrlWithToken(state));
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("ws_open_failed"));
  });

  const c = makeWsClient(ws);

  ws.send(
    JSON.stringify({
      type: "run_lines.start",
      script_id: 1,
      from: 1,
      to: 5,
      mode: "speed_through",
      me: "Melchior",
      read_all: false,
      pause_mult: 1.0,
      cue_words: 0,
      reveal_after: false,
      speed_mult: 1.3,
    }),
  );

  const started = await c.waitFor((m) => m?.type === "run_lines.session" && m?.event === "started", 3000);
  const sessionId = String(started.session_id ?? "");
  expect(sessionId.length).toBeGreaterThan(0);

  ws.send(JSON.stringify({ type: "run_lines.play", session_id: sessionId }));

  const kinds: Array<{ kind: string; idx: number; playback_rate?: number }> = [];
  while (true) {
    const msg = await c.waitFor((m) => m?.type === "run_lines.event" || (m?.type === "run_lines.session" && m?.event === "ended"), 3000);
    if (msg.type === "run_lines.session" && msg.event === "ended") break;

    const entry: { kind: string; idx: number; playback_rate?: number } = { kind: String(msg.kind ?? ""), idx: Number(msg.idx ?? -1) };
    if (typeof msg.playback_rate === "number") entry.playback_rate = msg.playback_rate;
    kinds.push(entry);
    ws.send(JSON.stringify({ type: "run_lines.ack", session_id: sessionId, event_id: msg.event_id, status: "done" }));
  }

  expect(kinds).toEqual([
    { kind: "direction", idx: 1 },
    { kind: "pause", idx: 2 },
    { kind: "line", idx: 3, playback_rate: 1.3 },
    { kind: "pause", idx: 4 },
    { kind: "direction", idx: 5 },
  ]);

  ws.close();
});

test("run-lines: jump replays from idx", async () => {
  if (!state) throw new Error("missing state");

  const ws = new WebSocket(wsUrlWithToken(state));
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("ws_open_failed"));
  });

  const c = makeWsClient(ws);

  ws.send(
    JSON.stringify({
      type: "run_lines.start",
      script_id: 1,
      from: 1,
      to: 5,
      mode: "speed_through",
      me: "Melchior",
      read_all: false,
      pause_mult: 1.0,
      cue_words: 0,
      reveal_after: false,
      speed_mult: 1.3,
    }),
  );

  const started = await c.waitFor((m) => m?.type === "run_lines.session" && m?.event === "started", 3000);
  const sessionId = String(started.session_id ?? "");

  ws.send(JSON.stringify({ type: "run_lines.play", session_id: sessionId }));

  // Drive to idx 4, then jump back to idx 2 and ensure we see pause idx=2 again.
  let sawIdx4 = false;
  while (!sawIdx4) {
    const msg = await c.waitFor((m) => m?.type === "run_lines.event", 3000);
    if (Number(msg.idx) === 4) {
      sawIdx4 = true;
      break;
    }
    ws.send(JSON.stringify({ type: "run_lines.ack", session_id: sessionId, event_id: msg.event_id, status: "done" }));
  }

  ws.send(JSON.stringify({ type: "run_lines.jump", session_id: sessionId, target_idx: 2 }));

  const replayed = await c.waitFor((m) => m?.type === "run_lines.event" && Number(m.idx) === 2 && m.kind === "pause", 3000);
  expect(replayed.kind).toBe("pause");
  expect(Number(replayed.idx)).toBe(2);

  // Cleanup: ack through to end so server records completion.
  ws.send(JSON.stringify({ type: "run_lines.ack", session_id: sessionId, event_id: replayed.event_id, status: "done" }));
  while (true) {
    const msg = await c.waitFor((m) => m?.type === "run_lines.event" || (m?.type === "run_lines.session" && m?.event === "ended"), 3000);
    if (msg.type === "run_lines.session" && msg.event === "ended") break;
    ws.send(JSON.stringify({ type: "run_lines.ack", session_id: sessionId, event_id: msg.event_id, status: "done" }));
  }

  ws.close();
});

test("run-lines: seek resets range and emits from new start", async () => {
  if (!state) throw new Error("missing state");

  const ws = new WebSocket(wsUrlWithToken(state));
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("ws_open_failed"));
  });

  const c = makeWsClient(ws);

  ws.send(
    JSON.stringify({
      type: "run_lines.start",
      script_id: 1,
      from: 1,
      to: 5,
      mode: "speed_through",
      me: "Melchior",
      read_all: false,
      pause_mult: 1.0,
      cue_words: 0,
      reveal_after: false,
      speed_mult: 1.3,
    }),
  );

  const started = await c.waitFor((m) => m?.type === "run_lines.session" && m?.event === "started", 3000);
  const sessionId = String(started.session_id ?? "");

  ws.send(JSON.stringify({ type: "run_lines.play", session_id: sessionId }));

  // Consume first event, then seek to start at idx 3.
  const first = await c.waitFor((m) => m?.type === "run_lines.event", 3000);
  ws.send(JSON.stringify({ type: "run_lines.ack", session_id: sessionId, event_id: first.event_id, status: "done" }));

  ws.send(JSON.stringify({ type: "run_lines.seek", session_id: sessionId, from: 3, to: 5 }));
  await c.waitFor((m) => m?.type === "run_lines.session" && m?.event === "seeked", 3000);

  const afterSeek = await c.waitFor((m) => m?.type === "run_lines.event" && Number(m.idx) === 3, 3000);
  expect(Number(afterSeek.idx)).toBe(3);

  // Cleanup.
  ws.send(JSON.stringify({ type: "run_lines.ack", session_id: sessionId, event_id: afterSeek.event_id, status: "done" }));
  while (true) {
    const msg = await c.waitFor((m) => m?.type === "run_lines.event" || (m?.type === "run_lines.session" && m?.event === "ended"), 3000);
    if (msg.type === "run_lines.session" && msg.event === "ended") break;
    ws.send(JSON.stringify({ type: "run_lines.ack", session_id: sessionId, event_id: msg.event_id, status: "done" }));
  }

  ws.close();
});

test("run-lines: set_speed emits speed session event", async () => {
  if (!state) throw new Error("missing state");

  const ws = new WebSocket(wsUrlWithToken(state));
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("ws_open_failed"));
  });

  const c = makeWsClient(ws);

  ws.send(
    JSON.stringify({
      type: "run_lines.start",
      script_id: 1,
      from: 1,
      to: 5,
      mode: "speed_through",
      me: "Melchior",
      read_all: false,
      pause_mult: 1.0,
      cue_words: 0,
      reveal_after: false,
      speed_mult: 1.3,
    }),
  );

  const started = await c.waitFor((m) => m?.type === "run_lines.session" && m?.event === "started", 3000);
  const sessionId = String(started.session_id ?? "");

  ws.send(JSON.stringify({ type: "run_lines.set_speed", session_id: sessionId, speed_mult: 2.0 }));
  const speed = await c.waitFor((m) => m?.type === "run_lines.session" && m?.event === "speed", 3000);
  expect(Number(speed.speed_mult)).toBeCloseTo(2.0, 5);

  // Cleanup.
  ws.send(JSON.stringify({ type: "run_lines.stop", session_id: sessionId }));
  await c.waitFor((m) => m?.type === "run_lines.session" && m?.event === "ended", 3000);

  ws.close();
});

test("run-lines: disconnect cleanup does not kill server", async () => {
  if (!state) throw new Error("missing state");

  // Start a session, then close the WS abruptly.
  const ws1 = new WebSocket(wsUrlWithToken(state));
  await new Promise<void>((resolve, reject) => {
    ws1.onopen = () => resolve();
    ws1.onerror = () => reject(new Error("ws_open_failed"));
  });
  const c1 = makeWsClient(ws1);
  ws1.send(
    JSON.stringify({
      type: "run_lines.start",
      script_id: 1,
      from: 1,
      to: 5,
      mode: "speed_through",
      me: "Melchior",
      read_all: false,
      pause_mult: 1.0,
      cue_words: 0,
      reveal_after: false,
      speed_mult: 1.3,
    }),
  );
  await c1.waitFor((m) => m?.type === "run_lines.session" && m?.event === "started", 3000);
  ws1.close();

  // If cleanup throws on the server, it tends to crash. Verify we can still connect and start a new session.
  const ws2 = new WebSocket(wsUrlWithToken(state));
  await new Promise<void>((resolve, reject) => {
    ws2.onopen = () => resolve();
    ws2.onerror = () => reject(new Error("ws_open_failed"));
  });
  const c2 = makeWsClient(ws2);
  ws2.send(
    JSON.stringify({
      type: "run_lines.start",
      script_id: 1,
      from: 1,
      to: 5,
      mode: "speed_through",
      me: "Melchior",
      read_all: false,
      pause_mult: 1.0,
      cue_words: 0,
      reveal_after: false,
      speed_mult: 1.3,
    }),
  );
  await c2.waitFor((m) => m?.type === "run_lines.session" && m?.event === "started", 3000);
  ws2.close();
});

