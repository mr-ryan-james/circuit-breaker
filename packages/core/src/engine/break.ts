import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getSiteBySlug } from "../db/queries.js";
import type { BreakMenu, BreakMenuLane, SiteType } from "../types.js";
import { selectBreakCards } from "./selection.js";

export function generateEventKey(): string {
  return `evt_${crypto.randomBytes(6).toString("hex")}`;
}

export function sameNeedPromptForType(type: SiteType): string {
  switch (type) {
    case "social":
      return "What are you hoping to find? (I can give 2 targeted searches or a direct next step without the feed.)";
    case "news":
    case "tech":
    default:
      return "What topic are you anxious about? (I can give a 5-bullet “what changed” brief without the feed.)";
  }
}

export interface BuildBreakMenuOptions {
  db: DatabaseSync;
  siteSlug: string;
  feedMinutes?: number;
  location?: string;
  context?: string;
}

export function buildBreakMenu(options: BuildBreakMenuOptions): BreakMenu {
  const site = getSiteBySlug(options.db, options.siteSlug);
  if (!site) throw new Error(`Unknown site: ${options.siteSlug}`);

  const eventKey = generateEventKey();
  const feedMinutes = options.feedMinutes ?? site.default_minutes;

  const location = options.location;
  const context = options.location ? undefined : options.context;
  const maxMinutes = 10;
  const chosenIds: number[] = [];

  const pickOne = (filters: {
    category?: string;
    tagsAny?: string[];
    tagsAll?: string[];
  }, cooldownServed?: number): ReturnType<typeof selectBreakCards>[number] | null => {
    const [card] =
      selectBreakCards(options.db, {
        count: 1,
        location,
        context,
        maxMinutes,
        cooldownServed,
        excludeCardIds: chosenIds,
        ...filters,
      }) ?? [];

    if (!card) return null;
    chosenIds.push(card.id);
    return card;
  };

  const pickOneOrFallback = (primary: Parameters<typeof pickOne>[0], fallback: Parameters<typeof pickOne>[0]): ReturnType<typeof pickOne> => {
    // Prefer respecting cooldown, but if a lane has a small pool (e.g. physical),
    // fall back to allowing repeats so the lane doesn't disappear.
    return pickOne(primary) ?? pickOne(primary, 0) ?? pickOne(fallback) ?? pickOne(fallback, 0);
  };

  // Goal: 4 distinct "break cards" every time:
  // - physical activity
  // - spanish verb
  // - spanish noun
  // - B1/B2 spanish lesson/quiz
  const physical = pickOneOrFallback({ category: "physical" }, {});
  const verb = pickOneOrFallback({ tagsAll: ["spanish", "verb"] }, { tagsAny: ["spanish"] });
  const noun = pickOneOrFallback({ tagsAll: ["spanish", "noun"] }, { tagsAny: ["spanish"] });
  const lesson = pickOneOrFallback({ tagsAll: ["spanish", "lesson", "b1b2"] }, { tagsAll: ["spanish", "grammar"] });

  const cards = [physical, verb, noun, lesson].filter(Boolean);
  if (cards.length === 0) throw new Error("No cards available. Run `site-toggle seed` to load a deck.");

  const lanes: BreakMenuLane[] = [
    { type: "same_need", prompt: sameNeedPromptForType(site.type as SiteType) },
    ...(physical ? [{ type: "physical", card: physical } as BreakMenuLane] : []),
    ...(verb ? [{ type: "verb", card: verb } as BreakMenuLane] : []),
    ...(noun ? [{ type: "noun", card: noun } as BreakMenuLane] : []),
    ...(lesson ? [{ type: "lesson", card: lesson } as BreakMenuLane] : []),
  ];

  lanes.push({
    type: "feed",
    site: site.slug,
    minutes: feedMinutes,
    command: `site-toggle on ${site.slug} ${feedMinutes}`,
  });

  return {
    event_key: eventKey,
    site: site.slug,
    context: options.location ? undefined : options.context,
    lanes,
  };
}
