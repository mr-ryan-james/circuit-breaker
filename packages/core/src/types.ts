export type SiteType = "social" | "news" | "tech";

// Card categories are intended to be user-extensible (e.g. "learning", "spanish_verbs"),
// while keeping autocomplete for the built-in categories.
export type CardCategory =
  | "restorative"
  | "physical"
  | "creative"
  | "intellectual"
  | "social"
  | "work_momentum"
  | (string & {});

// Location slugs are user-extensible (e.g. "home", "coworking", "brooklyn"), so keep as string.
export type CardLocation = string;

export type CardRarity = "common" | "uncommon" | "rare";

export type CardRating = "love" | "ok" | "meh" | "ban";

// NOTE: "card"/"card2" are legacy lane names kept for backwards compatibility
// with older break menus stored in the DB events log.
export type BreakLane = "same_need" | "physical" | "verb" | "noun" | "lesson" | "fusion" | "card" | "card2" | "feed";

// Context slugs are user-extensible, so keep as string.
export type BreakContext = string;

export interface SiteSeedDefinition {
  slug: string;
  type: SiteType;
  defaultMinutes: number;
  domains: string[];
}

export interface SiteRow {
  id: number;
  slug: string;
  type: SiteType;
  default_minutes: number;
}

export interface CardRow {
  id: number;
  key: string;
  category: CardCategory;
  minutes: number;
  activity: string;
  done_condition: string;
  prompt: string | null;
  location: CardLocation;
  rarity: CardRarity;
  tags_json: string;
  active: number;
}

export interface CompletedVerbCard {
  cardId: number;
  cardKey: string;
  verb: string;
  meaning: string;
  verbType: string;
  tags: string[];
  completedCount: number;
  lastCompletedAt: string;
}

export interface BreakCard {
  id: number;
  key: string;
  category: CardCategory;
  minutes: number;
  activity: string;
  doneCondition: string;
  prompt: string | null;
  location: CardLocation;
  rarity: CardRarity;
  tags: string[];
  active: boolean;
}

export interface BreakMenuLaneSameNeed {
  type: "same_need";
  prompt: string;
}

export interface BreakMenuLaneCard {
  type: "card";
  card: BreakCard;
}

export interface BreakMenuLaneCard2 {
  type: "card2";
  card: BreakCard;
}

export interface BreakMenuLanePhysical {
  type: "physical";
  card: BreakCard;
}

export interface BreakMenuLaneVerb {
  type: "verb";
  card: BreakCard;
}

export interface BreakMenuLaneNoun {
  type: "noun";
  card: BreakCard;
}

export interface BreakMenuLaneLesson {
  type: "lesson";
  card: BreakCard;
}

export interface BreakMenuLaneFusion {
  type: "fusion";
  card: BreakCard;
}

export interface BreakMenuLaneFeed {
  type: "feed";
  site: string;
  minutes: number;
  command: string;
}

export type BreakMenuLane =
  | BreakMenuLaneSameNeed
  | BreakMenuLanePhysical
  | BreakMenuLaneVerb
  | BreakMenuLaneNoun
  | BreakMenuLaneLesson
  | BreakMenuLaneFusion
  | BreakMenuLaneCard
  | BreakMenuLaneCard2
  | BreakMenuLaneFeed;

export interface BreakMenu {
  event_key: string;
  site: string;
  context?: BreakContext;
  lanes: BreakMenuLane[];
}
