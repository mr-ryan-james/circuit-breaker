const VERB_KEY_RE = /\.spanish\.verb\.([^.]+)\./i;

function extractVerbFromKey(cardKey: string): string {
  const match = cardKey.match(VERB_KEY_RE);
  if (match && match[1]) return match[1].toLowerCase();
  return "";
}

function extractVerbFromActivity(activity: string): string {
  const first = activity.trim().split(/\s+/)[0] ?? "";
  return first.replace(/[^\p{L}]/gu, "").toLowerCase();
}

function extractMeaningFromActivity(activity: string): string {
  const match = activity.match(/\(([^)]+)\)/);
  if (!match || !match[1]) return "";
  return match[1].trim();
}

function extractVerbTypeFromTags(tags: string[]): string {
  const priority = [
    "irregular-zco",
    "stem-e-ie",
    "stem-o-ue",
    "stem-e-i",
    "regular-ar",
    "regular-er",
    "regular-ir",
    "irregular",
    "reflexive",
  ];
  const tagSet = new Set(tags.map((t) => t.trim()).filter(Boolean));
  for (const t of priority) {
    if (tagSet.has(t)) return t;
  }
  return "";
}

export function extractVerbInfo(cardKey: string, activity: string, tags: string[]): {
  verb: string;
  meaning: string;
  verbType: string;
} {
  const fromKey = extractVerbFromKey(cardKey);
  const verb = fromKey || extractVerbFromActivity(activity) || "";
  const meaning = extractMeaningFromActivity(activity);
  const verbType = extractVerbTypeFromTags(tags);

  return { verb, meaning, verbType };
}
