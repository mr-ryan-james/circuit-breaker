import type { DatabaseSync } from "node:sqlite";
import type { CardRating, CardRow, CompletedVerbCard, SiteRow } from "../types.js";
import { extractVerbInfo } from "../modules/spanish.js";

export interface LocationRow {
  id: number;
  slug: string;
  name: string | null;
}

export interface ContextRow {
  id: number;
  slug: string;
  name: string | null;
}

function parseTagsJson(tagsJson: string): string[] {
  try {
    const parsed = JSON.parse(tagsJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(String).map((t) => t.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function getSiteBySlug(db: DatabaseSync, slug: string): SiteRow | null {
  const stmt = db.prepare("SELECT id, slug, type, default_minutes FROM sites WHERE slug = ? LIMIT 1");
  const row = stmt.get(slug) as unknown as SiteRow | undefined;
  return row ?? null;
}

export function getAllSites(db: DatabaseSync): SiteRow[] {
  const stmt = db.prepare("SELECT id, slug, type, default_minutes FROM sites ORDER BY slug");
  return stmt.all() as unknown as SiteRow[];
}

export function getDomainsForSiteId(db: DatabaseSync, siteId: number): string[] {
  const stmt = db.prepare("SELECT domain FROM domains WHERE site_id = ? ORDER BY domain");
  const rows = stmt.all(siteId) as Array<{ domain: string }>;
  return rows.map((r) => r.domain);
}

export function insertEvent(db: DatabaseSync, params: {
  type: string;
  eventKey?: string | null;
  siteId?: number | null;
  siteSlug?: string | null;
  minutes?: number | null;
  cardId?: number | null;
  metaJson?: string | null;
}): void {
  const stmt = db.prepare(
    `INSERT INTO events (type, event_key, site_id, site_slug, minutes, card_id, meta_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  stmt.run(
    params.type,
    params.eventKey ?? null,
    params.siteId ?? null,
    params.siteSlug ?? null,
    params.minutes ?? null,
    params.cardId ?? null,
    params.metaJson ?? null,
  );
}

export function listLocations(db: DatabaseSync): LocationRow[] {
  return db
    .prepare("SELECT id, slug, name FROM locations ORDER BY slug")
    .all() as unknown as LocationRow[];
}

export function listContexts(db: DatabaseSync): ContextRow[] {
  return db
    .prepare("SELECT id, slug, name FROM contexts ORDER BY slug")
    .all() as unknown as ContextRow[];
}

export function addLocation(db: DatabaseSync, slug: string, name?: string | null): void {
  db.prepare(
    `INSERT INTO locations (slug, name)
     VALUES (?, ?)
     ON CONFLICT(slug) DO UPDATE SET name=COALESCE(excluded.name, locations.name)`,
  ).run(slug, name ?? null);
}

export function addContext(db: DatabaseSync, slug: string, name?: string | null): void {
  db.prepare(
    `INSERT INTO contexts (slug, name)
     VALUES (?, ?)
     ON CONFLICT(slug) DO UPDATE SET name=COALESCE(excluded.name, contexts.name)`,
  ).run(slug, name ?? null);
}

function getLocationId(db: DatabaseSync, slug: string): number | null {
  const row = db.prepare("SELECT id FROM locations WHERE slug = ? LIMIT 1").get(slug) as { id: number } | undefined;
  return row?.id ?? null;
}

function getContextId(db: DatabaseSync, slug: string): number | null {
  const row = db.prepare("SELECT id FROM contexts WHERE slug = ? LIMIT 1").get(slug) as { id: number } | undefined;
  return row?.id ?? null;
}

export function linkContextLocation(db: DatabaseSync, contextSlug: string, locationSlug: string): void {
  const contextId = getContextId(db, contextSlug);
  if (!contextId) throw new Error(`Unknown context: ${contextSlug}`);
  const locationId = getLocationId(db, locationSlug);
  if (!locationId) throw new Error(`Unknown location: ${locationSlug}`);
  db.prepare("INSERT OR IGNORE INTO context_locations (context_id, location_id) VALUES (?, ?)").run(contextId, locationId);
}

export function unlinkContextLocation(db: DatabaseSync, contextSlug: string, locationSlug: string): void {
  const contextId = getContextId(db, contextSlug);
  if (!contextId) throw new Error(`Unknown context: ${contextSlug}`);
  const locationId = getLocationId(db, locationSlug);
  if (!locationId) throw new Error(`Unknown location: ${locationSlug}`);
  db.prepare("DELETE FROM context_locations WHERE context_id = ? AND location_id = ?").run(contextId, locationId);
}

export function getEligibleLocationSlugs(db: DatabaseSync, contextSlug: string): string[] {
  const rows = db
    .prepare(
      `SELECT l.slug AS slug
       FROM locations l
       JOIN context_locations cl ON cl.location_id = l.id
       JOIN contexts ctx ON ctx.id = cl.context_id
       WHERE ctx.slug = ?
       ORDER BY l.slug`,
    )
    .all(contextSlug) as unknown as Array<{ slug: string }>;
  return rows.map((r) => r.slug);
}

export function getContextLocations(db: DatabaseSync, contextSlug: string): { context: ContextRow; locations: LocationRow[] } {
  const context = db
    .prepare("SELECT id, slug, name FROM contexts WHERE slug = ? LIMIT 1")
    .get(contextSlug) as unknown as ContextRow | undefined;
  if (!context) throw new Error(`Unknown context: ${contextSlug}`);

  const locations = db
    .prepare(
      `SELECT l.id, l.slug, l.name
       FROM locations l
       JOIN context_locations cl ON cl.location_id = l.id
       WHERE cl.context_id = ?
       ORDER BY l.slug`,
    )
    .all(context.id) as unknown as LocationRow[];
  return { context, locations };
}

export function setCardRating(db: DatabaseSync, cardId: number, rating: CardRating): void {
  const stmt = db.prepare(
    `INSERT INTO card_ratings (card_id, rating, created_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(card_id) DO UPDATE SET rating=excluded.rating, created_at=excluded.created_at`,
  );
  stmt.run(cardId, rating);
}

export function getCardRating(db: DatabaseSync, cardId: number): CardRating | null {
  const stmt = db.prepare("SELECT rating FROM card_ratings WHERE card_id = ? LIMIT 1");
  const row = stmt.get(cardId) as { rating: CardRating } | undefined;
  return row?.rating ?? null;
}

export function getActiveCards(db: DatabaseSync, filters: {
  category?: string;
  location?: string;
  locations?: string[];
  maxMinutes?: number;
}): CardRow[] {
  const where: string[] = ["active = 1"];
  const args: Array<string | number> = [];

  if (filters.category) {
    where.push("category = ?");
    args.push(filters.category);
  }
  if (filters.location) {
    where.push("location = ?");
    args.push(filters.location);
  } else if (filters.locations && filters.locations.length > 0) {
    const placeholders = filters.locations.map(() => "?").join(", ");
    where.push(`location IN (${placeholders})`);
    for (const l of filters.locations) args.push(l);
  }
  if (typeof filters.maxMinutes === "number") {
    where.push("minutes <= ?");
    args.push(filters.maxMinutes);
  }

  const sql = `SELECT id, key, category, minutes, activity, done_condition, prompt, location, rarity, tags_json, active
               FROM cards
               WHERE ${where.join(" AND ")}
               ORDER BY id`;
  const stmt = db.prepare(sql);
  return stmt.all(...args) as unknown as CardRow[];
}

export function getActiveCardsForContext(db: DatabaseSync, contextSlug: string, filters: {
  category?: string;
  maxMinutes?: number;
}): CardRow[] {
  const where: string[] = ["c.active = 1"];
  const args: Array<string | number> = [];

  if (filters.category) {
    where.push("c.category = ?");
    args.push(filters.category);
  }
  if (typeof filters.maxMinutes === "number") {
    where.push("c.minutes <= ?");
    args.push(filters.maxMinutes);
  }

  where.push(`c.location IN (
    SELECT l.slug
    FROM locations l
    JOIN context_locations cl ON cl.location_id = l.id
    JOIN contexts ctx ON ctx.id = cl.context_id
    WHERE ctx.slug = ?
  )`);
  args.push(contextSlug);

  const sql = `
    SELECT c.id, c.key, c.category, c.minutes, c.activity, c.done_condition, c.prompt, c.location, c.rarity, c.tags_json, c.active
    FROM cards c
    WHERE ${where.join(" AND ")}
    ORDER BY c.id
  `;
  const stmt = db.prepare(sql);
  return stmt.all(...args) as unknown as CardRow[];
}

export function getRecentServedCardIds(db: DatabaseSync, limit: number): number[] {
  const stmt = db.prepare(
    `SELECT card_id
     FROM events
     WHERE type = 'card_served' AND card_id IS NOT NULL
     ORDER BY id DESC
     LIMIT ?`,
  );
  const rows = stmt.all(limit) as Array<{ card_id: number }>;
  return rows.map((r) => r.card_id);
}

export function setSiteUnblockedUntil(db: DatabaseSync, siteId: number, unblockedUntilUnix: number | null): void {
  const stmt = db.prepare(
    `INSERT INTO site_state (site_id, unblocked_until_unix, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(site_id) DO UPDATE SET unblocked_until_unix=excluded.unblocked_until_unix, updated_at=excluded.updated_at`,
  );
  stmt.run(siteId, unblockedUntilUnix);
}

export function getCompletedSpanishVerbCards(db: DatabaseSync, options: { days?: number } = {}): CompletedVerbCard[] {
  const days = options.days;
  const args: Array<string | number> = [];
  const daysClause =
    typeof days === "number" && Number.isFinite(days) && days > 0 ? (() => {
      args.push(`-${Math.trunc(days)} days`);
      return "AND e.created_at >= datetime('now', ?)";
    })() : "";

  const rows = db
    .prepare(
      `SELECT e.card_id AS card_id,
              e.created_at AS created_at,
              e.meta_json AS meta_json,
              c.key AS card_key,
              c.activity AS activity,
              c.tags_json AS tags_json
       FROM events e
       JOIN cards c ON c.id = e.card_id
       WHERE e.type = 'practice_completed'
         AND e.card_id IS NOT NULL
         AND c.active = 1
         ${daysClause}
       ORDER BY e.id DESC`,
    )
    .all(...args) as Array<{
    card_id: number | null;
    created_at: string;
    meta_json: string | null;
    card_key: string;
    activity: string;
    tags_json: string;
  }>;

  const byCard = new Map<number, CompletedVerbCard>();

  for (const row of rows) {
    const cardId = row.card_id;
    if (!cardId) continue;

    let meta: Record<string, unknown> = {};
    try {
      meta = row.meta_json ? (JSON.parse(row.meta_json) as Record<string, unknown>) : {};
    } catch {
      meta = {};
    }

    const status = typeof meta["status"] === "string" ? meta["status"].trim() : "";
    if (status !== "completed") continue;

    const moduleSlug = typeof meta["module_slug"] === "string" ? meta["module_slug"].trim() : "";
    if (moduleSlug && moduleSlug !== "spanish") continue;

    const tags = parseTagsJson(row.tags_json ?? "[]");
    const tagSet = new Set(tags);
    if (!tagSet.has("spanish")) continue;
    if (!(tagSet.has("verb") || tagSet.has("conjugation"))) continue;

    const { verb, meaning, verbType } = extractVerbInfo(row.card_key, row.activity, tags);
    if (!verb) continue;

    const existing = byCard.get(cardId);
    if (existing) {
      existing.completedCount += 1;
      if (row.created_at > existing.lastCompletedAt) {
        existing.lastCompletedAt = row.created_at;
      }
      continue;
    }

    byCard.set(cardId, {
      cardId,
      cardKey: row.card_key,
      verb,
      meaning,
      verbType,
      tags,
      completedCount: 1,
      lastCompletedAt: row.created_at,
    });
  }

  return Array.from(byCard.values()).sort((a, b) => b.lastCompletedAt.localeCompare(a.lastCompletedAt));
}

export function getSitesWithExpiredUnblocks(db: DatabaseSync, nowUnix: number): Array<{ site_id: number }> {
  const stmt = db.prepare(
    `SELECT site_id
     FROM site_state
     WHERE unblocked_until_unix IS NOT NULL AND unblocked_until_unix <= ?`,
  );
  return stmt.all(nowUnix) as unknown as Array<{ site_id: number }>;
}

export function getSiteState(db: DatabaseSync, siteId: number): { unblocked_until_unix: number | null } | null {
  const stmt = db.prepare("SELECT unblocked_until_unix FROM site_state WHERE site_id = ? LIMIT 1");
  const row = stmt.get(siteId) as { unblocked_until_unix: number | null } | undefined;
  return row ?? null;
}

export function findMostRecentOpenBreakEventKey(db: DatabaseSync): string | null {
  const stmt = db.prepare(
    `SELECT event_key
     FROM events
     WHERE type = 'break_served' AND event_key IS NOT NULL
     ORDER BY id DESC
     LIMIT 50`,
  );
  const rows = stmt.all() as unknown as Array<{ event_key: string }>;
  for (const r of rows) {
    const key = r.event_key;
    const chosen = db.prepare(`SELECT 1 FROM events WHERE event_key = ? AND type = 'break_chosen' LIMIT 1`).get(key);
    if (!chosen) return key;
  }
  return null;
}

export function getBreakServedEvent(db: DatabaseSync, eventKey: string): { meta_json: string | null } | null {
  const stmt = db.prepare(
    `SELECT meta_json
     FROM events
     WHERE type='break_served' AND event_key = ?
     ORDER BY id DESC
     LIMIT 1`,
  );
  const row = stmt.get(eventKey) as { meta_json: string | null } | undefined;
  return row ?? null;
}

export function getSetting(db: DatabaseSync, key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ? LIMIT 1").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
  ).run(key, value);
}
