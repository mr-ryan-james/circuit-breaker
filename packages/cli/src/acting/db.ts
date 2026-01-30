import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

import { resolveDbPath } from "@circuit-breaker/core";

function ensureDirExists(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getUidGidForUser(username: string): { uid: number; gid: number } | null {
  try {
    const uidRaw = execFileSync("id", ["-u", username], { encoding: "utf8" }).trim();
    const gidRaw = execFileSync("id", ["-g", username], { encoding: "utf8" }).trim();
    const uid = Number(uidRaw);
    const gid = Number(gidRaw);
    if (!Number.isFinite(uid) || !Number.isFinite(gid)) return null;
    return { uid, gid };
  } catch {
    return null;
  }
}

function ensureOwnershipForSudoUser(dbPath: string): void {
  if (process.getuid?.() !== 0) return;

  const sudoUser = process.env["SUDO_USER"];
  if (!sudoUser) return;
  const ids = getUidGidForUser(sudoUser);
  if (!ids) return;

  try {
    fs.chownSync(path.dirname(dbPath), ids.uid, ids.gid);
  } catch {
    // ignore
  }

  try {
    if (fs.existsSync(dbPath)) fs.chownSync(dbPath, ids.uid, ids.gid);
  } catch {
    // ignore
  }
}

export function resolveActingDbPath(): string {
  const override = process.env["CIRCUIT_BREAKER_ACTING_DB_PATH"]?.trim();
  if (override && override.length > 0) return override;
  const coreDbPath = resolveDbPath();
  return path.join(path.dirname(coreDbPath), "acting.db");
}

export function applyActingSchema(db: DatabaseSync): void {
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

    -- Practice history is used for "recent scenes" in the acting break lane.
    -- Keep it append-only so agents/users can see what happened and order by last practiced.
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

export interface ActingDbOpenResult {
  db: DatabaseSync;
  dbPath: string;
}

export function openActingDb(): ActingDbOpenResult {
  const dbPath = resolveActingDbPath();
  ensureDirExists(path.dirname(dbPath));
  ensureOwnershipForSudoUser(dbPath);
  const db = new DatabaseSync(dbPath);
  applyActingSchema(db);
  ensureOwnershipForSudoUser(dbPath);
  return { db, dbPath };
}
