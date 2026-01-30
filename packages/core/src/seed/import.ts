import fs from "node:fs";
import path from "node:path";
import type { SqliteDb } from "@circuit-breaker/shared-sqlite";

import { addContext, addLocation } from "../db/queries.js";
import { parseDelimitedWithHeader } from "./delimited.js";
import { seedCardsFromFile } from "./cards.js";

export type ImportFormat = "json" | "csv" | "tsv";

function inferFormat(filePath: string): ImportFormat {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".json") return "json";
  if (ext === ".csv") return "csv";
  if (ext === ".tsv") return "tsv";
  throw new Error(`Unsupported file type: ${ext || "(no extension)"} (expected .json/.csv/.tsv)`);
}

function readJson(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as unknown;
}

function getCell(table: { headers: string[]; rows: string[][] }, row: string[], key: string): string | undefined {
  const idx = table.headers.indexOf(key);
  if (idx === -1) return undefined;
  return row[idx];
}

function requireString(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${what} is required`);
  return value.trim();
}

export function importCardsFromFile(db: SqliteDb, filePath: string): { inserted: number; updated: number } {
  return seedCardsFromFile(db, filePath);
}

export function importLocationsFromFile(db: SqliteDb, filePath: string): { inserted: number; updated: number } {
  const format = inferFormat(filePath);
  const exists = db.prepare("SELECT 1 FROM locations WHERE slug = ? LIMIT 1");

  let inserted = 0;
  let updated = 0;

  if (format === "json") {
    const json = readJson(filePath);
    const records: unknown[] = Array.isArray(json) ? json : [json];
    for (const rec of records) {
      if (!rec || typeof rec !== "object") throw new Error("Location must be an object");
      const r = rec as { slug?: unknown; name?: unknown };
      const slug = requireString(r.slug, "locations.slug");
      const name = typeof r.name === "string" && r.name.trim().length > 0 ? r.name.trim() : null;
      const existed = Boolean(exists.get(slug));
      addLocation(db, slug, name);
      if (existed) updated += 1;
      else inserted += 1;
    }
    return { inserted, updated };
  }

  const delimiter = format === "csv" ? "," : "\t";
  const raw = fs.readFileSync(filePath, "utf8");
  const table = parseDelimitedWithHeader(raw, delimiter);

  for (const row of table.rows) {
    const slug = (getCell(table, row, "slug") ?? "").trim();
    const nameRaw = (getCell(table, row, "name") ?? "").trim();
    if (!slug) continue;
    const name = nameRaw.length > 0 ? nameRaw : null;
    const existed = Boolean(exists.get(slug));
    addLocation(db, slug, name);
    if (existed) updated += 1;
    else inserted += 1;
  }

  return { inserted, updated };
}

export function importContextsFromFile(db: SqliteDb, filePath: string): { inserted: number; updated: number } {
  const format = inferFormat(filePath);
  const exists = db.prepare("SELECT 1 FROM contexts WHERE slug = ? LIMIT 1");

  let inserted = 0;
  let updated = 0;

  if (format === "json") {
    const json = readJson(filePath);
    const records: unknown[] = Array.isArray(json) ? json : [json];
    for (const rec of records) {
      if (!rec || typeof rec !== "object") throw new Error("Context must be an object");
      const r = rec as { slug?: unknown; name?: unknown };
      const slug = requireString(r.slug, "contexts.slug");
      const name = typeof r.name === "string" && r.name.trim().length > 0 ? r.name.trim() : null;
      const existed = Boolean(exists.get(slug));
      addContext(db, slug, name);
      if (existed) updated += 1;
      else inserted += 1;
    }
    return { inserted, updated };
  }

  const delimiter = format === "csv" ? "," : "\t";
  const raw = fs.readFileSync(filePath, "utf8");
  const table = parseDelimitedWithHeader(raw, delimiter);

  for (const row of table.rows) {
    const slug = (getCell(table, row, "slug") ?? "").trim();
    const nameRaw = (getCell(table, row, "name") ?? "").trim();
    if (!slug) continue;
    const name = nameRaw.length > 0 ? nameRaw : null;
    const existed = Boolean(exists.get(slug));
    addContext(db, slug, name);
    if (existed) updated += 1;
    else inserted += 1;
  }

  return { inserted, updated };
}

export function importContextLocationsFromFile(db: SqliteDb, filePath: string): { inserted: number; skipped: number } {
  const format = inferFormat(filePath);

  let inserted = 0;
  let skipped = 0;

  const getContextId = db.prepare("SELECT id FROM contexts WHERE slug = ? LIMIT 1");
  const getLocationId = db.prepare("SELECT id FROM locations WHERE slug = ? LIMIT 1");
  const link = db.prepare("INSERT OR IGNORE INTO context_locations (context_id, location_id) VALUES (?, ?)");

  if (format === "json") {
    const json = readJson(filePath);
    const records: unknown[] = Array.isArray(json) ? json : [json];
    for (const rec of records) {
      if (!rec || typeof rec !== "object") throw new Error("Context-location mapping must be an object");
      const r = rec as { context_slug?: unknown; location_slug?: unknown; context?: unknown; location?: unknown };
      const contextSlug = requireString(r.context_slug ?? r.context, "context_locations.context_slug");
      const locationSlug = requireString(r.location_slug ?? r.location, "context_locations.location_slug");

      const ctxRow = getContextId.get(contextSlug) as { id: number } | undefined;
      if (!ctxRow) throw new Error(`Unknown context: ${contextSlug}`);
      const locRow = getLocationId.get(locationSlug) as { id: number } | undefined;
      if (!locRow) throw new Error(`Unknown location: ${locationSlug}`);

      const res = link.run(ctxRow.id, locRow.id);
      if (res.changes === 1) inserted += 1;
      else skipped += 1;
    }
    return { inserted, skipped };
  }

  const delimiter = format === "csv" ? "," : "\t";
  const raw = fs.readFileSync(filePath, "utf8");
  const table = parseDelimitedWithHeader(raw, delimiter);

  const contextKey = table.headers.includes("context_slug") ? "context_slug" : "context";
  const locationKey = table.headers.includes("location_slug") ? "location_slug" : "location";

  for (const row of table.rows) {
    const contextSlug = (getCell(table, row, contextKey) ?? "").trim();
    const locationSlug = (getCell(table, row, locationKey) ?? "").trim();
    if (!contextSlug || !locationSlug) continue;

    const ctxRow = getContextId.get(contextSlug) as { id: number } | undefined;
    if (!ctxRow) throw new Error(`Unknown context: ${contextSlug}`);
    const locRow = getLocationId.get(locationSlug) as { id: number } | undefined;
    if (!locRow) throw new Error(`Unknown location: ${locationSlug}`);

    const res = link.run(ctxRow.id, locRow.id);
    if (res.changes === 1) inserted += 1;
    else skipped += 1;
  }

  return { inserted, skipped };
}
