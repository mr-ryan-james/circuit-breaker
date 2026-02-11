import fs from "node:fs";
import path from "node:path";

import { applySchema, resolveDbPath } from "@circuit-breaker/core";
import { bunDbAdapter } from "@circuit-breaker/shared-sqlite";
import type { SqliteDb } from "@circuit-breaker/shared-sqlite";

import { Database } from "bun:sqlite";

import { ensureSpanishSchema } from "./spanishDb.js";
import { ensureAllGravySchema } from "./allGravyDb.js";

export function openCoreDb(): { db: SqliteDb; raw: Database; dbPath: string } {
  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const raw = new Database(dbPath);
  const db = bunDbAdapter(raw);
  applySchema(db);
  ensureSpanishSchema(db);
  ensureAllGravySchema(db);
  return { db, raw, dbPath };
}
