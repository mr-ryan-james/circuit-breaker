function isRomanNumeral(raw: string): boolean {
  const s = raw.trim().toUpperCase();
  if (!s) return false;
  return /^[IVXLCDM]{1,6}$/.test(s);
}

function isBarePageNumber(raw: string): boolean {
  const s = raw.trim();
  return /^\d{1,4}$/.test(s);
}

function isLikelyDomainToken(raw: string): boolean {
  const s = raw.trim();
  if (s.length >= 60) return false;
  return /^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(s);
}

export function sanitizeScriptSourceText(raw: string): string {
  const normalized = raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\f/g, "\n\n")
    .replace(/\u00a0/g, " ")
    .normalize("NFC");

  const lines = normalized.split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const lineRaw = lines[i] ?? "";
    const line = lineRaw.replace(/\s+$/g, "");
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();

    // High-confidence PDF watermarks/URLs
    if (lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("www.")) continue;
    if (lower.includes("copioni.corrierespettacolo.it")) continue;

    // Drop isolated page numbers / roman numerals (only when surrounded by blank lines)
    const prevBlank = i === 0 ? true : !(lines[i - 1]?.trim() ?? "");
    const nextBlank = i + 1 >= lines.length ? true : !(lines[i + 1]?.trim() ?? "");
    if (trimmed && prevBlank && nextBlank) {
      if (isBarePageNumber(trimmed) || isRomanNumeral(trimmed)) continue;
      if (isLikelyDomainToken(trimmed)) continue;
    }

    out.push(line);
  }

  // Collapse excessive blank lines, keep at most 2 in a row.
  const collapsed: string[] = [];
  let blankRun = 0;
  for (const l of out) {
    if (!l.trim()) blankRun += 1;
    else blankRun = 0;
    if (blankRun <= 2) collapsed.push(l);
  }

  return collapsed.join("\n").trim() + "\n";
}

export function sanitizeTtsText(raw: string): string {
  const s = raw
    .normalize("NFC")
    // Never speak parentheticals (common stage directions embedded in dialogue).
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const lower = s.toLowerCase();
  if (!s) return "";
  if (lower.includes("http://") || lower.includes("https://") || lower.includes("copioni.")) return "";
  return s;
}
