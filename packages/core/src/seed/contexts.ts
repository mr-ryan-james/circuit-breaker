import type { DatabaseSync } from "node:sqlite";

export interface LocationSeed {
  slug: string;
  name?: string;
}

export interface ContextSeed {
  slug: string;
  name?: string;
  locations: string[];
}

export const SEED_LOCATIONS: LocationSeed[] = [
  { slug: "any", name: "Anywhere" },
  { slug: "indoor", name: "Indoors" },
  { slug: "outdoor", name: "Outdoors" },
  { slug: "home", name: "Home only" },
  { slug: "ruzafa", name: "Ruzafa neighborhood" },
  { slug: "valencia", name: "Valencia city" },
];

export const SEED_CONTEXTS: ContextSeed[] = [
  { slug: "home", name: "Home", locations: ["any", "indoor", "outdoor", "home", "ruzafa", "valencia"] },
  { slug: "coworking", name: "Coworking", locations: ["any", "indoor", "outdoor"] },
];

// Additive seeding: insert defaults if missing; never deletes user customizations.
export function seedContextsAndLocations(db: DatabaseSync): void {
  const insertLocation = db.prepare(`INSERT OR IGNORE INTO locations (slug, name) VALUES (?, ?)`);
  const insertContext = db.prepare(`INSERT OR IGNORE INTO contexts (slug, name) VALUES (?, ?)`);
  const getLocationId = db.prepare(`SELECT id FROM locations WHERE slug = ? LIMIT 1`);
  const getContextId = db.prepare(`SELECT id FROM contexts WHERE slug = ? LIMIT 1`);
  const link = db.prepare(`INSERT OR IGNORE INTO context_locations (context_id, location_id) VALUES (?, ?)`);

  for (const loc of SEED_LOCATIONS) {
    insertLocation.run(loc.slug, loc.name ?? null);
  }

  for (const ctx of SEED_CONTEXTS) {
    insertContext.run(ctx.slug, ctx.name ?? null);
    const ctxRow = getContextId.get(ctx.slug) as { id: number } | undefined;
    if (!ctxRow) continue;
    for (const locSlug of ctx.locations) {
      const locRow = getLocationId.get(locSlug) as { id: number } | undefined;
      if (!locRow) continue;
      link.run(ctxRow.id, locRow.id);
    }
  }
}

