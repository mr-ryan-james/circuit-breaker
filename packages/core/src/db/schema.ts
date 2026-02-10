import type { SqliteDb } from "@circuit-breaker/shared-sqlite";

export function applySchema(db: SqliteDb): void {
  // NOTE: Keep this idempotent. We can add migrations later via PRAGMA user_version if needed.
  db.exec(`
    PRAGMA journal_mode = WAL;
    -- Avoid transient SQLITE_BUSY errors under light concurrent usage (UI server + CLI).
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS sites (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      default_minutes INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS domains (
      id INTEGER PRIMARY KEY,
      site_id INTEGER NOT NULL,
      domain TEXT NOT NULL,
      UNIQUE(site_id, domain),
      FOREIGN KEY(site_id) REFERENCES sites(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      minutes INTEGER NOT NULL,
      activity TEXT NOT NULL,
      done_condition TEXT NOT NULL,
      prompt TEXT,
      location TEXT NOT NULL,
      rarity TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    -- Normalized "where can this card be done" values
    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT
    );

    -- Normalized "where is Ryan right now" values
    CREATE TABLE IF NOT EXISTS contexts (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT
    );

    -- Junction: eligible card locations for each context
    CREATE TABLE IF NOT EXISTS context_locations (
      context_id INTEGER NOT NULL,
      location_id INTEGER NOT NULL,
      PRIMARY KEY (context_id, location_id),
      FOREIGN KEY(context_id) REFERENCES contexts(id) ON DELETE CASCADE,
      FOREIGN KEY(location_id) REFERENCES locations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS card_ratings (
      card_id INTEGER NOT NULL PRIMARY KEY,
      rating TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(card_id) REFERENCES cards(id) ON DELETE CASCADE
    );

    -- Lightweight spaced repetition state (v0: used for Spanish verb lane only).
    -- Keyed by (card_id, module_slug, lane) so future modules/lanes can opt in without schema churn.
    CREATE TABLE IF NOT EXISTS card_srs (
      card_id INTEGER NOT NULL,
      module_slug TEXT NOT NULL,
      lane TEXT NOT NULL,
      box INTEGER NOT NULL,
      due_at_unix INTEGER NOT NULL,
      last_reviewed_at_unix INTEGER,
      streak INTEGER NOT NULL DEFAULT 0,
      fail_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (card_id, module_slug, lane),
      FOREIGN KEY(card_id) REFERENCES cards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      type TEXT NOT NULL,
      event_key TEXT,
      site_id INTEGER,
      site_slug TEXT,
      minutes INTEGER,
      card_id INTEGER,
      meta_json TEXT,
      FOREIGN KEY(site_id) REFERENCES sites(id) ON DELETE SET NULL,
      FOREIGN KEY(card_id) REFERENCES cards(id) ON DELETE SET NULL
    );

    -- Minimal settings store (e.g. remember current context)
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_domains_site_id ON domains(site_id);
    CREATE INDEX IF NOT EXISTS idx_cards_location ON cards(location);
    CREATE INDEX IF NOT EXISTS idx_context_locations_context ON context_locations(context_id);
    CREATE INDEX IF NOT EXISTS idx_context_locations_location ON context_locations(location_id);
    CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
    CREATE INDEX IF NOT EXISTS idx_events_event_key ON events(event_key);
    CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
    CREATE INDEX IF NOT EXISTS idx_events_site_id ON events(site_id);
    CREATE INDEX IF NOT EXISTS idx_events_card_id ON events(card_id);
    CREATE INDEX IF NOT EXISTS idx_card_srs_due ON card_srs(module_slug, lane, due_at_unix);

    -- Optional durable timer support (Phase 4): store intended unblock expiry per site.
    CREATE TABLE IF NOT EXISTS site_state (
      site_id INTEGER PRIMARY KEY,
      unblocked_until_unix INTEGER,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(site_id) REFERENCES sites(id) ON DELETE CASCADE
    );
  `);
}
