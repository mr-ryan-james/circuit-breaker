import type { SqliteDb } from "@circuit-breaker/shared-sqlite";
import { getActiveCards, getActiveCardsForContext, getCardRating, getRecentServedCardIds } from "../db/queries.js";
import type { BreakCard, CardRating, CardRow } from "../types.js";

function parseTags(tagsJson: string): string[] {
  try {
    const parsed = JSON.parse(tagsJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(String).map((t) => t.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function rowToCard(row: CardRow): BreakCard {
  return {
    id: row.id,
    key: row.key,
    category: row.category,
    minutes: row.minutes,
    activity: row.activity,
    doneCondition: row.done_condition,
    prompt: row.prompt,
    location: row.location,
    rarity: row.rarity,
    tags: parseTags(row.tags_json),
    active: row.active === 1,
  };
}

function rarityWeight(rarity: string): number {
  switch (rarity) {
    case "common":
      return 1.0;
    case "uncommon":
      return 0.35;
    case "rare":
      return 0.12;
    default:
      return 0.5;
  }
}

function ratingWeight(rating: CardRating | null): number {
  switch (rating) {
    case "love":
      return 2.0;
    case "ok":
      return 1.0;
    case "meh":
      return 0.25;
    case "ban":
      return 0.0;
    default:
      return 1.0;
  }
}

function weightedPick<T>(items: Array<{ item: T; weight: number }>): T | null {
  const total = items.reduce((sum, it) => sum + it.weight, 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it.item;
  }
  return items[items.length - 1]?.item ?? null;
}

export interface SelectCardsOptions {
  count?: number;
  category?: string;
  location?: string;
  context?: string;
  maxMinutes?: number;
  cooldownServed?: number;
  excludeCardIds?: number[];
  tagsAny?: string[];
  tagsAll?: string[];
}

export function selectBreakCards(db: SqliteDb, options: SelectCardsOptions): BreakCard[] {
  const count = options.count ?? 1;
  const maxMinutes = options.maxMinutes ?? 10;
  const cooldownServed = options.cooldownServed ?? 20;

  const recentServed = new Set(getRecentServedCardIds(db, cooldownServed));
  const excluded = new Set(options.excludeCardIds ?? []);

  const tagsAny = (options.tagsAny ?? []).map((t) => t.trim()).filter(Boolean);
  const tagsAll = (options.tagsAll ?? []).map((t) => t.trim()).filter(Boolean);

  const rowMatchesTags = (row: CardRow): boolean => {
    if (tagsAny.length === 0 && tagsAll.length === 0) return true;
    const tagSet = new Set(parseTags(row.tags_json));
    if (tagsAny.length > 0) {
      const okAny = tagsAny.some((t) => tagSet.has(t));
      if (!okAny) return false;
    }
    if (tagsAll.length > 0) {
      const okAll = tagsAll.every((t) => tagSet.has(t));
      if (!okAll) return false;
    }
    return true;
  };

  let rows: CardRow[];
  if (options.location) {
    rows = getActiveCards(db, { category: options.category, location: options.location, maxMinutes });
  } else if (options.context) {
    rows = getActiveCardsForContext(db, options.context, { category: options.category, maxMinutes });
  } else {
    rows = getActiveCards(db, { category: options.category, maxMinutes });
  }

  rows = rows.filter((r) => !recentServed.has(r.id));
  rows = rows.filter((r) => !excluded.has(r.id));
  rows = rows.filter(rowMatchesTags);

  const picked: BreakCard[] = [];
  const usedCategories = new Set<string>();
  const usedLocations = new Set<string>();

  for (let i = 0; i < count; i += 1) {
    if (rows.length === 0) break;

    const strictCandidates = rows.filter((r) => !usedCategories.has(r.category) && !usedLocations.has(r.location));
    const relaxedLocation = rows.filter((r) => !usedCategories.has(r.category));
    const relaxedCategory = rows.filter((r) => !usedLocations.has(r.location));
    const pool = strictCandidates.length > 0 ? strictCandidates : relaxedLocation.length > 0 ? relaxedLocation : relaxedCategory.length > 0 ? relaxedCategory : rows;

    const weighted = pool
      .map((r) => {
        const rating = getCardRating(db, r.id);
        const base = rarityWeight(r.rarity) * ratingWeight(rating);
        return { item: r, weight: base };
      })
      .filter((x) => x.weight > 0);

    const chosenRow = weightedPick(weighted);
    if (!chosenRow) break;

    const card = rowToCard(chosenRow);
    picked.push(card);
    usedCategories.add(chosenRow.category);
    usedLocations.add(chosenRow.location);
    rows = rows.filter((r) => r.id !== chosenRow.id);
  }

  return picked;
}
