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

  // Request 2 cards - selection algorithm guarantees different categories
  const cards = selectBreakCards(options.db, {
    count: 2,
    location: options.location,
    context: options.location ? undefined : options.context,
    maxMinutes: 10,
  });
  if (cards.length === 0) {
    throw new Error("No cards available. Run `site-toggle seed` to load a deck.");
  }

  const lanes: BreakMenuLane[] = [
    { type: "same_need", prompt: sameNeedPromptForType(site.type as SiteType) },
    { type: "card", card: cards[0]! },
  ];

  // Add second card if available (different category guaranteed by selection algorithm)
  if (cards[1]) {
    lanes.push({ type: "card2", card: cards[1] });
  }

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
