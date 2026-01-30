function stripCueSuffixes(raw: string): string {
  // Strip common screenplay cue suffixes like (V.O.), (O.S.), (CONT'D)
  return raw.replace(/\s*\((?:V\.?O\.?|O\.?S\.?|OFF|CONT'?D|CONT\.?)\)\s*$/i, "");
}

export function normalizeCharacterName(raw: string): string {
  const cleaned = stripCueSuffixes(raw)
    .normalize("NFC")
    .trim()
    // Common OCR substitutions in cues (e.g., MELCH10R -> MELCHIOR).
    .toUpperCase()
    .replace(/0/g, "O")
    .replace(/1/g, "I")
    .replace(/5/g, "S")
    // Replace punctuation with spaces, keep letters/numbers.
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return cleaned;
}

export function normalizeMeName(raw: string): string {
  return normalizeCharacterName(raw);
}
