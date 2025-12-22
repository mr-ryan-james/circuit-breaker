import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { resolveDbPath } from "../paths.js";
import { applySchema } from "./schema.js";
import { seedSites } from "../seed/sites.js";
import { seedContextsAndLocations } from "../seed/contexts.js";

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

function ensureDirExists(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureOwnershipForUser(dbPath: string): void {
  if (process.getuid?.() !== 0) return;

  const sudoUser = process.env["SUDO_USER"];
  if (!sudoUser) return;

  const ids = getUidGidForUser(sudoUser);
  if (!ids) return;

  const dir = path.dirname(dbPath);
  try {
    fs.chownSync(dir, ids.uid, ids.gid);
  } catch {
    // ignore
  }

  try {
    if (fs.existsSync(dbPath)) fs.chownSync(dbPath, ids.uid, ids.gid);
  } catch {
    // ignore
  }
}

export interface DbOpenResult {
  db: DatabaseSync;
  dbPath: string;
}

export function openDb(): DbOpenResult {
  const dbPath = resolveDbPath();
  ensureDirExists(path.dirname(dbPath));

  // If running as root via sudo, keep the DB user-owned so non-sudo commands still work.
  ensureOwnershipForUser(dbPath);

  const db = new DatabaseSync(dbPath);
  applySchema(db);

  // No migrations in this project: if the DB schema is outdated, fail loudly with a clear reset instruction.
  // (Recreate by deleting the DB file and re-running `site-toggle seed`.)
  try {
    db.prepare("SELECT prompt FROM cards LIMIT 0").all();
  } catch {
    throw new Error(
      `Site Blocker DB schema is out of date.\n` +
        `Delete and recreate it:\n` +
        `  rm -f ${dbPath}\n` +
        `  site-toggle seed`,
    );
  }
  seedSites(db);
  seedContextsAndLocations(db);

  // If the DB was created as root, fix ownership after creation too.
  ensureOwnershipForUser(dbPath);

  return { db, dbPath };
}
