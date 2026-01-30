import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveDbPath } from "@circuit-breaker/core";
import { bunDbAdapter } from "@circuit-breaker/shared-sqlite";
import type { SqliteDb } from "@circuit-breaker/shared-sqlite";

import { Database } from "bun:sqlite";

export function resolveActingDbPath(): string {
  const override = process.env["CIRCUIT_BREAKER_ACTING_DB_PATH"]?.trim();
  if (override && override.length > 0) return override;
  const coreDbPath = resolveDbPath();
  return path.join(path.dirname(coreDbPath), "acting.db");
}

export function ensureActingSchema(db: SqliteDb): void {
  // Keep identical to CLI schema (idempotent).
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS scripts (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      source_format TEXT NOT NULL,
      source_text TEXT NOT NULL,
      parser_version INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS script_characters (
      id INTEGER PRIMARY KEY,
      script_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      voice TEXT NOT NULL,
      rate TEXT NOT NULL,
      UNIQUE(script_id, normalized_name),
      FOREIGN KEY(script_id) REFERENCES scripts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_script_characters_script ON script_characters(script_id);

    CREATE TABLE IF NOT EXISTS script_lines (
      id INTEGER PRIMARY KEY,
      script_id INTEGER NOT NULL,
      idx INTEGER NOT NULL,
      type TEXT NOT NULL,
      speaker_normalized TEXT,
      text TEXT NOT NULL,
      scene_number INTEGER,
      scene_heading TEXT,
      UNIQUE(script_id, idx),
      FOREIGN KEY(script_id) REFERENCES scripts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_script_lines_script_idx ON script_lines(script_id, idx);

    CREATE TABLE IF NOT EXISTS script_progress (
      id INTEGER PRIMARY KEY,
      script_id INTEGER NOT NULL,
      me_normalized TEXT NOT NULL,
      last_idx INTEGER NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(script_id, me_normalized),
      FOREIGN KEY(script_id) REFERENCES scripts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS script_edits (
      id INTEGER PRIMARY KEY,
      script_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      FOREIGN KEY(script_id) REFERENCES scripts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_script_edits_script ON script_edits(script_id);

    CREATE TABLE IF NOT EXISTS script_practice_events (
      id INTEGER PRIMARY KEY,
      script_id INTEGER NOT NULL,
      me_normalized TEXT NOT NULL,
      mode TEXT NOT NULL,
      read_all INTEGER NOT NULL,
      from_idx INTEGER NOT NULL,
      to_idx INTEGER NOT NULL,
      loops_completed INTEGER NOT NULL,
      last_idx INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(script_id) REFERENCES scripts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_script_practice_events_script_created ON script_practice_events(script_id, created_at);
  `);
}

export function openActingDb(): { db: SqliteDb; raw: Database; dbPath: string } {
  const dbPath = resolveActingDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const raw = new Database(dbPath);
  const db = bunDbAdapter(raw);
  ensureActingSchema(db);
  return { db, raw, dbPath };
}

