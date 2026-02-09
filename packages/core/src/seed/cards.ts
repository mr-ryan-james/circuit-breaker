import fs from "node:fs";
import path from "node:path";
import type { SqliteDb } from "@circuit-breaker/shared-sqlite";
import type { CardCategory, CardLocation, CardRarity } from "../types.js";
import { parseDelimitedWithHeader } from "./delimited.js";

export interface CardSeedDefinition {
  key: string;
  category: CardCategory;
  minutes: number;
  activity: string;
  done_condition: string;
  prompt?: string;
  location: CardLocation;
  rarity: CardRarity;
  tags: string[];
  active?: boolean;
}

function loadRawCardsFromFile(filePath: string): unknown[] {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".json") {
    const raw = fs.readFileSync(filePath, "utf8");
    const json = JSON.parse(raw) as unknown;
    return Array.isArray(json) ? json : [json];
  }

  if (ext === ".csv" || ext === ".tsv") {
    const raw = fs.readFileSync(filePath, "utf8");
    const delimiter = ext === ".csv" ? "," : "\t";
    const table = parseDelimitedWithHeader(raw, delimiter);

    const headerIndex = new Map<string, number>();
    for (let i = 0; i < table.headers.length; i += 1) {
      headerIndex.set(table.headers[i]!.trim().toLowerCase(), i);
    }

    const cell = (row: string[], key: string): string | undefined => {
      const idx = headerIndex.get(key.toLowerCase());
      if (idx === undefined) return undefined;
      return row[idx];
    };

    const cardsFromCsv: unknown[] = [];
    for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
      const row = table.rows[rowIndex]!;
      const key = (cell(row, "key") ?? "").trim();
      if (!key) continue;

      const category = (cell(row, "category") ?? "").trim();
      const minutesRaw = (cell(row, "minutes") ?? "").trim();
      const minutes = Number(minutesRaw);
      if (!Number.isFinite(minutes)) {
        throw new Error(`Invalid minutes for ${key} (row ${rowIndex + 2}): ${minutesRaw}`);
      }
      const activity = (cell(row, "activity") ?? "").trim();
      const doneCondition =
        (cell(row, "done_condition") ?? cell(row, "done") ?? cell(row, "doneCondition") ?? cell(row, "donecondition") ?? "").trim();
      const prompt = (cell(row, "prompt") ?? "").trim();
      const location = (cell(row, "location") ?? "").trim();
      const rarity = (cell(row, "rarity") ?? "").trim();
      const tags = parseTagsCell(cell(row, "tags") ?? cell(row, "tags_json"));

      const active = parseActiveCell(cell(row, "active"));

      cardsFromCsv.push({
        key,
        category,
        minutes,
        activity,
        done_condition: doneCondition,
        prompt: prompt.length > 0 ? prompt : undefined,
        location,
        rarity,
        tags,
        active,
      });
    }

    return cardsFromCsv;
  }

  throw new Error(`Unsupported cards file type: ${ext || "(no extension)"} (expected .json/.csv/.tsv)`);
}

function parseTagsCell(raw: string | undefined): string[] {
  const v = (raw ?? "").trim();
  if (v.length === 0) return [];

  if (v.startsWith("[") && v.endsWith("]")) {
    try {
      const parsed = JSON.parse(v) as unknown;
      if (Array.isArray(parsed)) return parsed.map(String).map((t) => t.trim()).filter(Boolean);
    } catch {
      // fall through to split parsing
    }
  }

  const delimiter = v.includes("|") ? "|" : ",";
  return v
    .split(delimiter)
    .map((t) => t.trim())
    .filter(Boolean);
}

function parseActiveCell(raw: string | undefined): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  if (v.length === 0) return true;
  if (v === "0" || v === "false" || v === "no" || v === "n") return false;
  if (v === "1" || v === "true" || v === "yes" || v === "y") return true;
  throw new Error(`Invalid active value: ${raw}`);
}

function normalizeCardSeed(input: unknown): CardSeedDefinition {
  if (!input || typeof input !== "object") throw new Error("Card must be an object");
  const card = input as Partial<CardSeedDefinition> & { tags?: unknown; prompt?: unknown };

  if (typeof card.key !== "string" || card.key.trim().length === 0) throw new Error("Card.key is required");
  if (typeof card.category !== "string") throw new Error(`Card.category invalid for ${card.key}`);
  if (typeof card.minutes !== "number" || !Number.isFinite(card.minutes)) throw new Error(`Card.minutes invalid for ${card.key}`);
  if (typeof card.activity !== "string" || card.activity.trim().length === 0) throw new Error(`Card.activity invalid for ${card.key}`);
  if (typeof card.done_condition !== "string" || card.done_condition.trim().length === 0) {
    throw new Error(`Card.done_condition invalid for ${card.key}`);
  }
  if (card.prompt !== undefined && typeof card.prompt !== "string") throw new Error(`Card.prompt invalid for ${card.key}`);
  if (typeof card.location !== "string") throw new Error(`Card.location invalid for ${card.key}`);
  if (typeof card.rarity !== "string") throw new Error(`Card.rarity invalid for ${card.key}`);

  let tags: string[] = [];
  if (Array.isArray(card.tags)) {
    tags = card.tags.map(String).map((t) => t.trim()).filter(Boolean);
  } else {
    throw new Error(`Card.tags must be an array for ${card.key}`);
  }

  const prompt = typeof card.prompt === "string" ? card.prompt.trim() : undefined;

  return {
    key: card.key.trim(),
    category: card.category as CardCategory,
    minutes: Math.trunc(card.minutes),
    activity: card.activity.trim(),
    done_condition: card.done_condition.trim(),
    prompt: prompt && prompt.length > 0 ? prompt : undefined,
    location: card.location as CardLocation,
    rarity: card.rarity as CardRarity,
    tags,
    active: card.active ?? true,
  };
}

export function seedCardsFromFile(db: SqliteDb, filePath: string): { inserted: number; updated: number } {
  const cards = loadRawCardsFromFile(filePath);

  const upsert = db.prepare(
    `INSERT INTO cards (key, category, minutes, activity, done_condition, prompt, location, rarity, tags_json, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       category=excluded.category,
       minutes=excluded.minutes,
       activity=excluded.activity,
       done_condition=excluded.done_condition,
       prompt=excluded.prompt,
       location=excluded.location,
       rarity=excluded.rarity,
       tags_json=excluded.tags_json,
       active=excluded.active`,
  );

  const existsStmt = db.prepare("SELECT 1 FROM cards WHERE key = ? LIMIT 1");

  let inserted = 0;
  let updated = 0;

  for (const c of cards) {
    const card = normalizeCardSeed(c);
    const existed = Boolean(existsStmt.get(card.key));
    upsert.run(
      card.key,
      card.category,
      card.minutes,
      card.activity,
      card.done_condition,
      card.prompt ?? null,
      card.location,
      card.rarity,
      JSON.stringify(card.tags),
      card.active ? 1 : 0,
    );
    if (existed) updated += 1;
    else inserted += 1;
  }

  return { inserted, updated };
}

export function seedCardsFromDir(db: SqliteDb, dirPath: string): {
  files: number;
  inserted: number;
  updated: number;
  duplicate_keys: Array<{ key: string; files: string[] }>;
} {
  const files = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((d) => d.isFile() && (d.name.endsWith(".json") || d.name.endsWith(".csv") || d.name.endsWith(".tsv")))
    .map((d) => path.join(dirPath, d.name))
    .sort();

  // Pre-scan for duplicate keys across files. We still seed (upsert) so the system works,
  // but duplicates are almost always accidental and should be cleaned up.
  const keyToFiles = new Map<string, Set<string>>();
  for (const file of files) {
    const rawCards = loadRawCardsFromFile(file);
    for (const c of rawCards) {
      const def = normalizeCardSeed(c);
      const set = keyToFiles.get(def.key) ?? new Set<string>();
      set.add(path.basename(file));
      keyToFiles.set(def.key, set);
    }
  }

  const duplicate_keys = Array.from(keyToFiles.entries())
    .filter(([, set]) => set.size > 1)
    .map(([key, set]) => ({ key, files: Array.from(set).sort() }))
    .sort((a, b) => a.key.localeCompare(b.key));

  let inserted = 0;
  let updated = 0;
  for (const file of files) {
    const res = seedCardsFromFile(db, file);
    inserted += res.inserted;
    updated += res.updated;
  }

  return { files: files.length, inserted, updated, duplicate_keys };
}
