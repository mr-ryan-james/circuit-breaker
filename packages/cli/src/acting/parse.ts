import { normalizeCharacterName } from "./names.js";
import type { ScriptIR, ScriptLine, ScriptLineType } from "./types.js";

function isSceneHeadingLine(trimmed: string): boolean {
  return /^(INT|EXT|EST|I\/E)\.?\b/i.test(trimmed) || /^SCENE\s+\d+\b/i.test(trimmed);
}

function isAllCapsCueLine(trimmed: string): boolean {
  if (!trimmed) return false;
  if (trimmed.length > 40) return false;
  if (isSceneHeadingLine(trimmed)) return false;
  // Mostly uppercase letters/spaces/punct, and must contain at least one letter.
  if (!/[A-Z]/.test(trimmed)) return false;
  if (/[^A-Z0-9 .,'’"()\-]/.test(trimmed)) return false;
  // Avoid common false positives
  if (trimmed === trimmed.toUpperCase() && /^[A-Z0-9][A-Z0-9 .,'’"()\-]*$/.test(trimmed)) return true;
  return false;
}

function splitLeadingParenthetical(text: string): { parenthetical: string | null; rest: string } {
  const m = text.match(/^\(([^)]+)\)\s*(.*)$/);
  if (!m) return { parenthetical: null, rest: text };
  const paren = (m[1] ?? "").trim();
  const rest = (m[2] ?? "").trim();
  return { parenthetical: paren.length > 0 ? paren : null, rest };
}

function looksLikeDialogueContinuation(trimmed: string): boolean {
  if (!trimmed) return false;
  if (trimmed.startsWith("(")) return false;
  // Only treat as continuation when it begins like mid-sentence.
  return /^[a-z]/.test(trimmed) || /^[,.;:—-]/.test(trimmed) || trimmed.startsWith("…");
}

function pushLine(lines: ScriptLine[], line: Omit<ScriptLine, "idx">): void {
  lines.push({ idx: lines.length + 1, ...line });
}

export function detectFormat(sourceText: string): "colon" | "fountain" | null {
  const sample = sourceText.slice(0, 20_000);
  const hasFountainScene = /^(INT|EXT|EST|I\/E)\.?\b/im.test(sample);
  const colonMatches = sample.match(/^[A-Za-z0-9 .'-]{2,40}:\s+\S+/gm) ?? [];
  if (hasFountainScene) return "fountain";
  if (colonMatches.length >= 3) return "colon";
  return null;
}

export function parseColonScript(sourceText: string, title: string): ScriptIR {
  const charactersByNorm = new Map<string, { name: string; aliases: Set<string> }>();
  const lines: ScriptLine[] = [];

  const rawLines = sourceText.split("\n");
  let currentSceneHeading: string | null = null;
  let currentSceneNumber: number | null = null;

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    if (isSceneHeadingLine(trimmed)) {
      currentSceneHeading = trimmed;
      const m = trimmed.match(/^SCENE\s+(\d+)\b/i);
      if (m && m[1]) currentSceneNumber = Number(m[1]);
      pushLine(lines, { type: "scene", text: trimmed, scene_heading: currentSceneHeading ?? undefined, scene_number: currentSceneNumber ?? undefined });
      continue;
    }

    // Colon-style cue, optionally with a parenthetical before the delimiter and sometimes OCR uses ';'.
    // Examples:
    // - FRAU GABOR (From off): Melchior?
    // - MORITZ (“Yes”): I'm exhausted...
    // - MELCHIOR; Sit. Let me roll you a smoke.
    const m = trimmed.match(/^([A-Za-z0-9 .'-]{2,40})(?:\s*\(([^)]+)\))?\s*[:;]\s+(.+)$/);
    if (m && m[1] && m[3]) {
      const speakerRaw = m[1].trim();
      const speakerNorm = normalizeCharacterName(speakerRaw);
      const entry = charactersByNorm.get(speakerNorm) ?? { name: speakerRaw, aliases: new Set<string>() };
      entry.aliases.add(speakerRaw);
      charactersByNorm.set(speakerNorm, entry);

      const cueParen = (m[2] ?? "").trim();
      if (cueParen) {
        pushLine(lines, {
          type: "parenthetical",
          speaker_normalized: speakerNorm,
          text: cueParen,
          scene_heading: currentSceneHeading ?? undefined,
          scene_number: currentSceneNumber ?? undefined,
        });
      }

      const { parenthetical, rest } = splitLeadingParenthetical(m[3].trim());
      if (parenthetical) {
        pushLine(lines, {
          type: "parenthetical",
          speaker_normalized: speakerNorm,
          text: parenthetical,
          scene_heading: currentSceneHeading ?? undefined,
          scene_number: currentSceneNumber ?? undefined,
        });
      }
      if (rest) {
        pushLine(lines, {
          type: "dialogue",
          speaker_normalized: speakerNorm,
          text: rest,
          scene_heading: currentSceneHeading ?? undefined,
          scene_number: currentSceneNumber ?? undefined,
        });
      }
      continue;
    }

    // Dialogue continuation (common in PDF extraction): append to previous dialogue.
    if (looksLikeDialogueContinuation(trimmed)) {
      const prev = lines.length > 0 ? lines[lines.length - 1] : null;
      if (prev && prev.type === "dialogue") {
        prev.text = `${prev.text} ${trimmed}`.replace(/\s+/g, " ").trim();
        continue;
      }
    }

    // Stage directions / action (never spoken)
    pushLine(lines, {
      type: "action",
      text: trimmed,
      scene_heading: currentSceneHeading ?? undefined,
      scene_number: currentSceneNumber ?? undefined,
    });
  }

  const characters = Array.from(charactersByNorm.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([norm, v]) => ({
      name: v.name,
      normalized_name: norm,
      voice: "",
      rate: "+0%",
      aliases: Array.from(v.aliases).sort(),
    }));

  return { title, source_format: "colon", parser_version: 1, characters, lines };
}

export function parseFountainScript(sourceText: string, title: string): ScriptIR {
  const charactersByNorm = new Map<string, { name: string; aliases: Set<string> }>();
  const lines: ScriptLine[] = [];

  const rawLines = sourceText.split("\n");
  let i = 0;

  let currentSceneHeading: string | null = null;
  let currentSceneNumber: number | null = null;
  let currentSpeakerNorm: string | null = null;

  while (i < rawLines.length) {
    const raw = rawLines[i] ?? "";
    const trimmed = raw.trim();
    i += 1;
    if (!trimmed) {
      currentSpeakerNorm = null;
      continue;
    }

    if (isSceneHeadingLine(trimmed)) {
      currentSpeakerNorm = null;
      currentSceneHeading = trimmed;
      currentSceneNumber = currentSceneNumber === null ? 1 : currentSceneNumber + 1;
      pushLine(lines, { type: "scene", text: trimmed, scene_heading: trimmed, scene_number: currentSceneNumber });
      continue;
    }

    if (isAllCapsCueLine(trimmed)) {
      const speakerRaw = trimmed;
      const speakerNorm = normalizeCharacterName(speakerRaw);
      currentSpeakerNorm = speakerNorm;
      const entry = charactersByNorm.get(speakerNorm) ?? { name: speakerRaw, aliases: new Set<string>() };
      entry.aliases.add(speakerRaw);
      charactersByNorm.set(speakerNorm, entry);
      continue;
    }

    if (currentSpeakerNorm && /^\(.+\)$/.test(trimmed)) {
      pushLine(lines, {
        type: "parenthetical",
        speaker_normalized: currentSpeakerNorm,
        text: trimmed.replace(/^\(|\)$/g, "").trim(),
        scene_heading: currentSceneHeading ?? undefined,
        scene_number: currentSceneNumber ?? undefined,
      });
      continue;
    }

    if (currentSpeakerNorm) {
      // Dialogue block: consume contiguous non-empty lines until blank line or new cue/scene.
      const parts: string[] = [trimmed];
      while (i < rawLines.length) {
        const peek = rawLines[i] ?? "";
        const peekTrim = peek.trim();
        if (!peekTrim) break;
        if (isSceneHeadingLine(peekTrim)) break;
        if (isAllCapsCueLine(peekTrim)) break;
        if (/^\(.+\)$/.test(peekTrim)) break;
        parts.push(peekTrim);
        i += 1;
      }

      const joined = parts.join(" ").replace(/\s+/g, " ").trim();
      const { parenthetical, rest } = splitLeadingParenthetical(joined);
      if (parenthetical) {
        pushLine(lines, {
          type: "parenthetical",
          speaker_normalized: currentSpeakerNorm,
          text: parenthetical,
          scene_heading: currentSceneHeading ?? undefined,
          scene_number: currentSceneNumber ?? undefined,
        });
      }
      if (rest) {
        pushLine(lines, {
          type: "dialogue",
          speaker_normalized: currentSpeakerNorm,
          text: rest,
          scene_heading: currentSceneHeading ?? undefined,
          scene_number: currentSceneNumber ?? undefined,
        });
      }
      continue;
    }

    // Action line
    pushLine(lines, { type: "action", text: trimmed, scene_heading: currentSceneHeading ?? undefined, scene_number: currentSceneNumber ?? undefined });
  }

  const characters = Array.from(charactersByNorm.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([norm, v]) => ({
      name: v.name,
      normalized_name: norm,
      voice: "",
      rate: "+0%",
      aliases: Array.from(v.aliases).sort(),
    }));

  return { title, source_format: "fountain", parser_version: 1, characters, lines };
}
