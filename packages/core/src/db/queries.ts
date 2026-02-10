import type { SqliteDb } from "@circuit-breaker/shared-sqlite";
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

export type CardSrsRow = {
  card_id: number;
  module_slug: string;
  lane: string;
  box: number;
  due_at_unix: number;
  last_reviewed_at_unix: number | null;
  streak: number;
  fail_count: number;
  created_at: string;
  updated_at: string;
};

function parseTagsJson(tagsJson: string): string[] {
  try {
    const parsed = JSON.parse(tagsJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(String).map((t) => t.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function getSiteBySlug(db: SqliteDb, slug: string): SiteRow | null {
  const stmt = db.prepare("SELECT id, slug, type, default_minutes FROM sites WHERE slug = ? LIMIT 1");
  const row = stmt.get(slug) as unknown as SiteRow | undefined;
  return row ?? null;
}

export function getAllSites(db: SqliteDb): SiteRow[] {
  const stmt = db.prepare("SELECT id, slug, type, default_minutes FROM sites ORDER BY slug");
  return stmt.all() as unknown as SiteRow[];
}

export function getDomainsForSiteId(db: SqliteDb, siteId: number): string[] {
  const stmt = db.prepare("SELECT domain FROM domains WHERE site_id = ? ORDER BY domain");
  const rows = stmt.all(siteId) as Array<{ domain: string }>;
  return rows.map((r) => r.domain);
}

export function insertEvent(db: SqliteDb, params: {
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

export function listLocations(db: SqliteDb): LocationRow[] {
  return db
    .prepare("SELECT id, slug, name FROM locations ORDER BY slug")
    .all() as unknown as LocationRow[];
}

export function listContexts(db: SqliteDb): ContextRow[] {
  return db
    .prepare("SELECT id, slug, name FROM contexts ORDER BY slug")
    .all() as unknown as ContextRow[];
}

export function addLocation(db: SqliteDb, slug: string, name?: string | null): void {
  db.prepare(
    `INSERT INTO locations (slug, name)
     VALUES (?, ?)
     ON CONFLICT(slug) DO UPDATE SET name=COALESCE(excluded.name, locations.name)`,
  ).run(slug, name ?? null);
}

export function addContext(db: SqliteDb, slug: string, name?: string | null): void {
  db.prepare(
    `INSERT INTO contexts (slug, name)
     VALUES (?, ?)
     ON CONFLICT(slug) DO UPDATE SET name=COALESCE(excluded.name, contexts.name)`,
  ).run(slug, name ?? null);
}

function getLocationId(db: SqliteDb, slug: string): number | null {
  const row = db.prepare("SELECT id FROM locations WHERE slug = ? LIMIT 1").get(slug) as { id: number } | undefined;
  return row?.id ?? null;
}

function getContextId(db: SqliteDb, slug: string): number | null {
  const row = db.prepare("SELECT id FROM contexts WHERE slug = ? LIMIT 1").get(slug) as { id: number } | undefined;
  return row?.id ?? null;
}

export function linkContextLocation(db: SqliteDb, contextSlug: string, locationSlug: string): void {
  const contextId = getContextId(db, contextSlug);
  if (!contextId) throw new Error(`Unknown context: ${contextSlug}`);
  const locationId = getLocationId(db, locationSlug);
  if (!locationId) throw new Error(`Unknown location: ${locationSlug}`);
  db.prepare("INSERT OR IGNORE INTO context_locations (context_id, location_id) VALUES (?, ?)").run(contextId, locationId);
}

export function unlinkContextLocation(db: SqliteDb, contextSlug: string, locationSlug: string): void {
  const contextId = getContextId(db, contextSlug);
  if (!contextId) throw new Error(`Unknown context: ${contextSlug}`);
  const locationId = getLocationId(db, locationSlug);
  if (!locationId) throw new Error(`Unknown location: ${locationSlug}`);
  db.prepare("DELETE FROM context_locations WHERE context_id = ? AND location_id = ?").run(contextId, locationId);
}

export function getEligibleLocationSlugs(db: SqliteDb, contextSlug: string): string[] {
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

export function getContextLocations(db: SqliteDb, contextSlug: string): { context: ContextRow; locations: LocationRow[] } {
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

export function setCardRating(db: SqliteDb, cardId: number, rating: CardRating): void {
  const stmt = db.prepare(
    `INSERT INTO card_ratings (card_id, rating, created_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(card_id) DO UPDATE SET rating=excluded.rating, created_at=excluded.created_at`,
  );
  stmt.run(cardId, rating);
}

export function getCardRating(db: SqliteDb, cardId: number): CardRating | null {
  const stmt = db.prepare("SELECT rating FROM card_ratings WHERE card_id = ? LIMIT 1");
  const row = stmt.get(cardId) as { rating: CardRating } | undefined;
  return row?.rating ?? null;
}

export function getCardSrs(db: SqliteDb, args: { cardId: number; moduleSlug: string; lane: string }): CardSrsRow | null {
  const row = db
    .prepare(
      `SELECT card_id, module_slug, lane, box, due_at_unix, last_reviewed_at_unix, streak, fail_count, created_at, updated_at
       FROM card_srs
       WHERE card_id = ? AND module_slug = ? AND lane = ?
       LIMIT 1`,
    )
    .get(args.cardId, args.moduleSlug, args.lane) as unknown as CardSrsRow | undefined;
  return row ?? null;
}

export function listDueSrsCardIds(
  db: SqliteDb,
  args: { moduleSlug: string; lane: string; nowUnix?: number; limit?: number },
): number[] {
  const nowUnix = args.nowUnix ?? Math.floor(Date.now() / 1000);
  const limit = args.limit ?? 50;
  const rows = db
    .prepare(
      `SELECT card_id
       FROM card_srs
       WHERE module_slug = ? AND lane = ? AND due_at_unix <= ?
       ORDER BY due_at_unix ASC, card_id ASC
       LIMIT ?`,
    )
    .all(args.moduleSlug, args.lane, nowUnix, limit) as Array<{ card_id: number }>;
  return rows.map((r) => r.card_id);
}

const LEITNER_MAX_BOX = 5;
const LEITNER_DAYS_BY_BOX: Record<number, number> = {
  1: 0,
  2: 1,
  3: 3,
  4: 7,
  5: 14,
};

function clampLeitnerBox(box: number): number {
  if (!Number.isFinite(box)) return 1;
  return Math.max(1, Math.min(LEITNER_MAX_BOX, Math.trunc(box)));
}

function dueAtForBox(nowUnix: number, box: number): number {
  const b = clampLeitnerBox(box);
  const days = LEITNER_DAYS_BY_BOX[b] ?? 0;
  return nowUnix + days * 24 * 60 * 60;
}

/**
 * Record a Leitner-style review outcome for a specific card+lane.
 * v0 policy:
 * - success: move up one box (max box), schedule by box interval
 * - failure: reset to box 1 (due now)
 */
export function recordSrsReview(
  db: SqliteDb,
  args: {
    cardId: number;
    moduleSlug: string;
    lane: string;
    outcome: "success" | "failure";
    nowUnix?: number;
  },
): CardSrsRow {
  const nowUnix = args.nowUnix ?? Math.floor(Date.now() / 1000);
  const existing = getCardSrs(db, { cardId: args.cardId, moduleSlug: args.moduleSlug, lane: args.lane });

  const prevBox = clampLeitnerBox(existing?.box ?? 1);
  const nextBox = args.outcome === "success" ? clampLeitnerBox(prevBox + 1) : 1;
  const nextStreak = args.outcome === "success" ? (existing?.streak ?? 0) + 1 : 0;
  const nextFailCount = args.outcome === "failure" ? (existing?.fail_count ?? 0) + 1 : (existing?.fail_count ?? 0);
  const dueAtUnix = args.outcome === "failure" ? nowUnix : dueAtForBox(nowUnix, nextBox);

  db.prepare(
    `INSERT INTO card_srs
      (card_id, module_slug, lane, box, due_at_unix, last_reviewed_at_unix, streak, fail_count, created_at, updated_at)
     VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(card_id, module_slug, lane) DO UPDATE SET
       box = excluded.box,
       due_at_unix = excluded.due_at_unix,
       last_reviewed_at_unix = excluded.last_reviewed_at_unix,
       streak = excluded.streak,
       fail_count = excluded.fail_count,
       updated_at = datetime('now')`,
  ).run(
    args.cardId,
    args.moduleSlug,
    args.lane,
    nextBox,
    dueAtUnix,
    nowUnix,
    nextStreak,
    nextFailCount,
  );

  return (
    getCardSrs(db, { cardId: args.cardId, moduleSlug: args.moduleSlug, lane: args.lane }) ?? {
      card_id: args.cardId,
      module_slug: args.moduleSlug,
      lane: args.lane,
      box: nextBox,
      due_at_unix: dueAtUnix,
      last_reviewed_at_unix: nowUnix,
      streak: nextStreak,
      fail_count: nextFailCount,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  );
}

export function getActiveCards(db: SqliteDb, filters: {
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

export function getActiveCardsForContext(db: SqliteDb, contextSlug: string, filters: {
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

export function getRecentServedCardIds(db: SqliteDb, limit: number): number[] {
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

export function setSiteUnblockedUntil(db: SqliteDb, siteId: number, unblockedUntilUnix: number | null): void {
  const stmt = db.prepare(
    `INSERT INTO site_state (site_id, unblocked_until_unix, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(site_id) DO UPDATE SET unblocked_until_unix=excluded.unblocked_until_unix, updated_at=excluded.updated_at`,
  );
  stmt.run(siteId, unblockedUntilUnix);
}

export function getCompletedSpanishVerbCards(db: SqliteDb, options: { days?: number } = {}): CompletedVerbCard[] {
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

export function getSitesWithExpiredUnblocks(db: SqliteDb, nowUnix: number): Array<{ site_id: number }> {
  const stmt = db.prepare(
    `SELECT site_id
     FROM site_state
     WHERE unblocked_until_unix IS NOT NULL AND unblocked_until_unix <= ?`,
  );
  return stmt.all(nowUnix) as unknown as Array<{ site_id: number }>;
}

export function getSiteState(db: SqliteDb, siteId: number): { unblocked_until_unix: number | null } | null {
  const stmt = db.prepare("SELECT unblocked_until_unix FROM site_state WHERE site_id = ? LIMIT 1");
  const row = stmt.get(siteId) as { unblocked_until_unix: number | null } | undefined;
  return row ?? null;
}

export function findMostRecentOpenBreakEventKey(db: SqliteDb): string | null {
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

export function getBreakServedEvent(db: SqliteDb, eventKey: string): { meta_json: string | null } | null {
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

export function getSetting(db: SqliteDb, key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ? LIMIT 1").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(db: SqliteDb, key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
  ).run(key, value);
}
