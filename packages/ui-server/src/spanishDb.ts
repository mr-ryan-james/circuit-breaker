import crypto from "node:crypto";

import type { SqliteDb } from "@circuit-breaker/shared-sqlite";

export type SpanishSessionStatus = "open" | "completed" | "abandoned";

export type SpanishSessionRow = {
  id: string;
  created_at: string;
  updated_at: string;
  status: SpanishSessionStatus;
  source: string;
  event_key: string | null;
  lane: string | null;
  card_id: number | null;
  card_key: string | null;
  card_prompt: string | null;
  codex_thread_id: string | null;
  pending_tool_json: string | null;
  meta_json: string;
};

export type SpanishTurnRole = "system" | "user" | "assistant" | "tool";

export function makeSpanishId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function ensureSpanishSchema(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS spanish_sessions (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      event_key TEXT,
      lane TEXT,
      card_id INTEGER,
      card_key TEXT,
      card_prompt TEXT,
      codex_thread_id TEXT,
      pending_tool_json TEXT,
      meta_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_spanish_sessions_status ON spanish_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_spanish_sessions_updated ON spanish_sessions(updated_at);

    CREATE TABLE IF NOT EXISTS spanish_turns (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      role TEXT NOT NULL,
      kind TEXT NOT NULL,
      content TEXT,
      json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_spanish_turns_session_idx ON spanish_turns(session_id, idx);
  `);
}

export function insertSpanishSession(db: SqliteDb, row: Omit<SpanishSessionRow, "created_at" | "updated_at">): void {
  const ts = nowIso();
  db.prepare(
    `INSERT INTO spanish_sessions
      (id, created_at, updated_at, status, source, event_key, lane, card_id, card_key, card_prompt, codex_thread_id, pending_tool_json, meta_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    ts,
    ts,
    row.status,
    row.source,
    row.event_key,
    row.lane,
    row.card_id,
    row.card_key,
    row.card_prompt,
    row.codex_thread_id,
    row.pending_tool_json,
    row.meta_json ?? "{}",
  );
}

export function getSpanishSession(db: SqliteDb, id: string): SpanishSessionRow | null {
  const row = db.prepare(`SELECT * FROM spanish_sessions WHERE id = ?`).get(id) as any;
  return row ?? null;
}

export function updateSpanishSession(
  db: SqliteDb,
  id: string,
  patch: Partial<
    Pick<
      SpanishSessionRow,
      "status" | "codex_thread_id" | "pending_tool_json" | "meta_json" | "event_key" | "lane" | "card_id" | "card_key" | "card_prompt"
    >
  >,
): void {
  const existing = getSpanishSession(db, id);
  if (!existing) return;

  const next: SpanishSessionRow = {
    ...existing,
    ...patch,
    updated_at: nowIso(),
    meta_json: patch.meta_json ?? existing.meta_json ?? "{}",
  };

  db.prepare(
    `UPDATE spanish_sessions
     SET updated_at = ?,
         status = ?,
         source = ?,
         event_key = ?,
         lane = ?,
         card_id = ?,
         card_key = ?,
         card_prompt = ?,
         codex_thread_id = ?,
         pending_tool_json = ?,
         meta_json = ?
     WHERE id = ?`,
  ).run(
    next.updated_at,
    next.status,
    next.source,
    next.event_key,
    next.lane,
    next.card_id,
    next.card_key,
    next.card_prompt,
    next.codex_thread_id,
    next.pending_tool_json,
    next.meta_json ?? "{}",
    id,
  );
}

export function insertSpanishTurn(db: SqliteDb, args: {
  session_id: string;
  idx: number;
  role: SpanishTurnRole;
  kind: string;
  content?: string | null;
  json?: unknown;
}): void {
  db.prepare(
    `INSERT INTO spanish_turns
      (id, session_id, idx, role, kind, content, json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    makeSpanishId("sp_turn"),
    args.session_id,
    args.idx,
    args.role,
    args.kind,
    args.content ?? null,
    args.json ? JSON.stringify(args.json) : null,
    nowIso(),
  );
}

export function listSpanishTurns(db: SqliteDb, session_id: string, limit = 1000): any[] {
  return db
    .prepare(`SELECT id, session_id, idx, role, kind, content, json, created_at FROM spanish_turns WHERE session_id = ? ORDER BY idx ASC LIMIT ?`)
    .all(session_id, limit) as any[];
}

export function listSpanishSessions(db: SqliteDb, limit = 20): Array<{
  id: string;
  created_at: string;
  updated_at: string;
  status: SpanishSessionStatus;
  source: string;
  event_key: string | null;
  lane: string | null;
  card_id: number | null;
  card_key: string | null;
  card_prompt: string | null;
  codex_thread_id: string | null;
  pending_tool_json: string | null;
}> {
  return db
    .prepare(
      `SELECT
         id, created_at, updated_at, status, source, event_key, lane, card_id, card_key, card_prompt, codex_thread_id, pending_tool_json
       FROM spanish_sessions
       ORDER BY updated_at DESC
       LIMIT ?`,
    )
    .all(limit) as any[];
}

export function nextSpanishTurnIdx(db: SqliteDb, session_id: string): number {
  const row = db.prepare(`SELECT COALESCE(MAX(idx), -1) AS max_idx FROM spanish_turns WHERE session_id = ?`).get(session_id) as any;
  const max = Number(row?.max_idx ?? -1);
  return Number.isFinite(max) ? max + 1 : 0;
}
