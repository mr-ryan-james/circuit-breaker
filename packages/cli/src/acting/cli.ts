import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import type { DatabaseSync } from "node:sqlite";

import { openActingDb } from "./db.js";
import { sanitizeScriptSourceText } from "./sanitize.js";
import { detectFormat, parseColonScript, parseFountainScript } from "./parse.js";
import { normalizeCharacterName, normalizeMeName } from "./names.js";
import type { ScriptLineType } from "./types.js";
import { runLinesSession } from "./session.js";

type JsonPrinter = (obj: unknown) => void;

function commandExists(cmd: string): boolean {
  try {
    execFileSync("command", ["-v", cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function requireCommand(cmd: string, hint: string): void {
  if (commandExists(cmd)) return;
  throw new Error(`${cmd} not found. ${hint}`);
}

function isInteractive(json: boolean): boolean {
  if (json) return false;
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function parseLoop(raw: string | undefined): number | "forever" | null {
  if (!raw) return null;
  if (raw === "forever" || raw === "inf" || raw === "infinite") return "forever";
  if (/^\d+$/.test(raw)) return Math.max(1, Number(raw));
  return null;
}

function safeNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseScriptLineType(raw: string): ScriptLineType | null {
  if (raw === "dialogue" || raw === "scene" || raw === "action" || raw === "parenthetical") return raw;
  return null;
}

function getLastInsertRowId(db: DatabaseSync): number {
  const row = db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number };
  return Number(row.id);
}

function ensureContiguousIdx(db: DatabaseSync, scriptId: number): void {
  const rows = db
    .prepare("SELECT idx, type, speaker_normalized, text, scene_number, scene_heading FROM script_lines WHERE script_id = ? ORDER BY idx")
    .all(scriptId) as Array<{
    idx: number;
    type: ScriptLineType;
    speaker_normalized: string | null;
    text: string;
    scene_number: number | null;
    scene_heading: string | null;
  }>;

  const ins = db.prepare(
    `INSERT INTO script_lines (script_id, idx, type, speaker_normalized, text, scene_number, scene_heading)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM script_lines WHERE script_id = ?").run(scriptId);
    let idx = 1;
    for (const r of rows) {
      ins.run(scriptId, idx, r.type, r.speaker_normalized, r.text, r.scene_number, r.scene_heading);
      idx += 1;
    }
    db.exec("COMMIT");
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore
    }
    throw e;
  }
}

function recordEdit(db: DatabaseSync, scriptId: number, kind: string, payload: unknown): void {
  db.prepare("INSERT INTO script_edits (script_id, kind, payload_json) VALUES (?, ?, ?)").run(scriptId, kind, JSON.stringify(payload));
}

function defaultVoiceCycle(): Array<{ voice: string; rate: string }> {
  // Keep this small + stable. Agent can re-map using `run-lines tts-voices` + `set-voice`.
  return [
    { voice: "en-US-GuyNeural", rate: "+0%" },
    { voice: "en-US-JennyNeural", rate: "+0%" },
    { voice: "en-US-RogerNeural", rate: "+0%" },
    { voice: "en-US-AriaNeural", rate: "+0%" },
    { voice: "en-US-SteffanNeural", rate: "+0%" },
    { voice: "en-US-EmmaNeural", rate: "+0%" },
    { voice: "en-GB-RyanNeural", rate: "+0%" },
    { voice: "en-GB-SoniaNeural", rate: "+0%" },
  ];
}

function readFileOrPdfText(filePath: string): string {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) throw new Error(`File not found: ${abs}`);

  if (abs.toLowerCase().endsWith(".pdf")) {
    requireCommand("pdftotext", "Install with: brew install poppler");
    const out = execFileSync("pdftotext", [abs, "-"], { encoding: "utf8" });
    return out;
  }

  return fs.readFileSync(abs, "utf8");
}

function parseVoiceList(text: string): Array<{ name: string; gender: string; content_categories: string; voice_personalities: string; locale: string | null }> {
  const lines = text.split("\n").map((l) => l.replace(/\s+$/g, ""));
  const out: Array<{ name: string; gender: string; content_categories: string; voice_personalities: string; locale: string | null }> = [];

  // Skip header lines until we see the separator row of dashes.
  let i = 0;
  while (i < lines.length && !/^---/.test(lines[i] ?? "")) i += 1;
  // Skip separator row
  while (i < lines.length && /^---/.test(lines[i] ?? "")) i += 1;

  for (; i < lines.length; i += 1) {
    const l = (lines[i] ?? "").trim();
    if (!l) continue;
    const cols = l.split(/\s{2,}/);
    const name = cols[0]?.trim() ?? "";
    const gender = cols[1]?.trim() ?? "";
    const content = cols[2]?.trim() ?? "";
    const personalities = cols[3]?.trim() ?? "";
    if (!name) continue;
    const m = name.match(/^([a-z]{2}-[A-Z]{2})-/);
    const locale = m?.[1] ?? null;
    out.push({ name, gender, content_categories: content, voice_personalities: personalities, locale });
  }
  return out;
}

function loadScriptOrThrow(db: DatabaseSync, scriptId: number): { id: number; title: string; source_format: string; parser_version: number } {
  const row = db
    .prepare("SELECT id, title, source_format, parser_version FROM scripts WHERE id = ? LIMIT 1")
    .get(scriptId) as { id: number; title: string; source_format: string; parser_version: number } | undefined;
  if (!row) throw new Error(`Unknown script_id: ${scriptId}`);
  return row;
}

export async function cmdRunLines(args: string[], json: boolean, printJson: JsonPrinter): Promise<void> {
  const sub = args[0] ?? "help";
  const actionArgs = args.slice(1);

  if (sub === "help" || sub === "--help" || sub === "-h") {
    const usage = [
      "run-lines import <file> [--format auto|colon|fountain] [--title <t>]",
      "run-lines list",
      "run-lines show <script_id>",
      "run-lines characters <script_id>",
      "run-lines tts-voices [--lang en-US] [--gender Male|Female] [--contains <s>]",
      "run-lines set-voice <script_id> --character <name> --voice <voice> [--rate +0%]",
      "run-lines lines <script_id> [--from N] [--to M]",
      "run-lines patch <script_id> <drop-range|merge|replace-text|set-speaker|set-type> ...",
      "run-lines practice <script_id> (--me <name> | --read-all) [--mode practice|learn|boss] [--loop N|forever] [--from N] [--to M]",
    ];
    const notes = [
      "Modes:",
      "- practice: speak other characters; your lines are silent pauses (best for memorization)",
      "- learn: like practice, but can reveal your line after the pause (default reveal on)",
      "- boss: speed-through mode (shorter pauses; cues default off)",
      "",
      "Common patterns:",
      "- Read only other parts (you=Melchior): run-lines practice <id> --me \"Melchior\" --mode practice",
      "- Read all parts aloud (table read): run-lines practice <id> --read-all",
      "- Speed through: run-lines practice <id> --me \"Melchior\" --mode boss",
      "",
      "Directions:",
      "- Default prints directions (never spoken). Use --no-directions to hide them.",
    ];

    if (json) {
      printJson({ ok: true, command: "run-lines", help: true, usage, notes });
      return;
    }
    console.log("Run Lines usage:");
    for (const u of usage) console.log(`  site-toggle ${u}`);
    console.log("");
    for (const n of notes) console.log(n);
    return;
  }

  const { db } = openActingDb();

  if (sub === "list") {
    const rows = db
      .prepare("SELECT id, title, source_format, created_at FROM scripts ORDER BY id DESC")
      .all() as Array<{ id: number; title: string; source_format: string; created_at: string }>;
    if (json) {
      printJson({ ok: true, command: "run-lines", action: "list", scripts: rows });
      return;
    }
    if (rows.length === 0) {
      console.log("No scripts imported yet.");
      console.log('Try: site-toggle run-lines import "scene.pdf" --format colon');
      return;
    }
    for (const r of rows) console.log(`${r.id}: ${r.title} (${r.source_format})`);
    return;
  }

  if (sub === "import") {
    const filePath = actionArgs[0];
    if (!filePath) throw new Error("Usage: run-lines import <file> [--format auto|colon|fountain] [--title <t>]");

    let format: "auto" | "colon" | "fountain" = "auto";
    let title: string | null = null;
    for (let i = 1; i < actionArgs.length; i += 1) {
      const a = actionArgs[i];
      const next = actionArgs[i + 1];
      if (a === "--format" && next && (next === "auto" || next === "colon" || next === "fountain")) {
        format = next;
        i += 1;
        continue;
      }
      if (a === "--title" && next) {
        title = next;
        i += 1;
        continue;
      }
    }

    const raw = readFileOrPdfText(filePath);
    const sanitized = sanitizeScriptSourceText(raw);
    const detected = detectFormat(sanitized);
    const chosenFormat = format === "auto" ? detected ?? "colon" : format;
    const finalTitle = title ?? path.basename(filePath).replace(/\.[^.]+$/, "");

    const ir =
      chosenFormat === "fountain" ? parseFountainScript(sanitized, finalTitle) : parseColonScript(sanitized, finalTitle);

    db.prepare("INSERT INTO scripts (title, source_format, source_text, parser_version) VALUES (?, ?, ?, ?)")
      .run(ir.title, ir.source_format, sanitized, ir.parser_version);
    const scriptId = getLastInsertRowId(db);

    // Insert lines
    const insLine = db.prepare(
      `INSERT INTO script_lines (script_id, idx, type, speaker_normalized, text, scene_number, scene_heading)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const l of ir.lines) {
      insLine.run(
        scriptId,
        l.idx,
        l.type,
        l.speaker_normalized ?? null,
        l.text,
        (l as any).scene_number ?? null,
        (l as any).scene_heading ?? null,
      );
    }

    // Insert characters with default voices (agent can override later)
    const cycle = defaultVoiceCycle();
    const insChar = db.prepare(
      `INSERT INTO script_characters (script_id, name, normalized_name, voice, rate)
       VALUES (?, ?, ?, ?, ?)`,
    );

    ir.characters.forEach((c, idx) => {
      const picked = cycle[idx % cycle.length] ?? cycle[0]!;
      insChar.run(scriptId, c.name, c.normalized_name, picked.voice, picked.rate);
    });

    if (json) {
      printJson({
        ok: true,
        command: "run-lines",
        action: "import",
        script_id: scriptId,
        title: ir.title,
        format: ir.source_format,
        character_count: ir.characters.length,
        line_count: ir.lines.length,
      });
      return;
    }
    console.log(`Imported script ${scriptId}: ${ir.title}`);
    console.log(`Characters: ${ir.characters.length}, Lines: ${ir.lines.length}`);
    console.log(`Next: site-toggle run-lines practice ${scriptId} --me "Melchior" --mode practice --loop 3`);
    return;
  }

  if (sub === "show") {
    const scriptIdRaw = actionArgs[0];
    if (!scriptIdRaw || !/^\d+$/.test(scriptIdRaw)) throw new Error("Usage: run-lines show <script_id>");
    const scriptId = Number(scriptIdRaw);
    const script = loadScriptOrThrow(db, scriptId);

    const chars = db
      .prepare("SELECT name, normalized_name, voice, rate FROM script_characters WHERE script_id = ? ORDER BY normalized_name")
      .all(scriptId) as Array<{ name: string; normalized_name: string; voice: string; rate: string }>;

    const counts = db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN type='dialogue' THEN 1 ELSE 0 END) AS dialogue,
           SUM(CASE WHEN type='scene' THEN 1 ELSE 0 END) AS scenes
         FROM script_lines
         WHERE script_id = ?`,
      )
      .get(scriptId) as { total: number; dialogue: number; scenes: number };

    const sceneRows = db
      .prepare(
        `SELECT idx, scene_number, scene_heading
         FROM script_lines
         WHERE script_id = ? AND type = 'scene'
         ORDER BY idx`,
      )
      .all(scriptId) as Array<{ idx: number; scene_number: number | null; scene_heading: string | null }>;

    if (json) {
      printJson({
        ok: true,
        command: "run-lines",
        action: "show",
        script: { id: script.id, title: script.title, format: script.source_format, parser_version: script.parser_version },
        counts: { total: counts.total, dialogue: counts.dialogue, scenes: counts.scenes },
        characters: chars,
        scenes: sceneRows,
      });
      return;
    }

    console.log(`${script.id}: ${script.title} (${script.source_format})`);
    console.log(`Lines: ${counts.total} (dialogue ${counts.dialogue})`);
    console.log("");
    console.log("Characters:");
    for (const c of chars) console.log(`- ${c.normalized_name}: ${c.voice} ${c.rate}`);
    if (sceneRows.length > 0) {
      console.log("");
      console.log("Scenes:");
      for (const s of sceneRows) console.log(`- idx ${s.idx}${s.scene_number ? ` (scene ${s.scene_number})` : ""}: ${s.scene_heading ?? ""}`);
    }
    return;
  }

  if (sub === "characters") {
    const scriptIdRaw = actionArgs[0];
    if (!scriptIdRaw || !/^\d+$/.test(scriptIdRaw)) throw new Error("Usage: run-lines characters <script_id>");
    const scriptId = Number(scriptIdRaw);
    loadScriptOrThrow(db, scriptId);

    const chars = db
      .prepare("SELECT name, normalized_name, voice, rate FROM script_characters WHERE script_id = ? ORDER BY normalized_name")
      .all(scriptId) as Array<{ name: string; normalized_name: string; voice: string; rate: string }>;

    if (json) {
      printJson({ ok: true, command: "run-lines", action: "characters", script_id: scriptId, characters: chars });
      return;
    }
    for (const c of chars) console.log(`${c.normalized_name}: ${c.voice} ${c.rate}`);
    return;
  }

  if (sub === "tts-voices") {
    requireCommand("edge-tts", "Install with: pipx install edge-tts");

    let lang: string | null = null;
    let gender: string | null = null;
    let contains: string | null = null;
    for (let i = 0; i < actionArgs.length; i += 1) {
      const a = actionArgs[i];
      const next = actionArgs[i + 1];
      if (a === "--lang" && next) {
        lang = next;
        i += 1;
        continue;
      }
      if (a === "--gender" && next) {
        gender = next;
        i += 1;
        continue;
      }
      if (a === "--contains" && next) {
        contains = next;
        i += 1;
        continue;
      }
    }

    const raw = execFileSync("edge-tts", ["--list-voices"], { encoding: "utf8" });
    let voices = parseVoiceList(raw);

    if (lang) {
      const prefix = `${lang}-`;
      voices = voices.filter((v) => v.name.startsWith(prefix));
    }
    if (gender) {
      const g = gender.toLowerCase();
      voices = voices.filter((v) => v.gender.toLowerCase() === g);
    }
    if (contains) {
      const needle = contains.toLowerCase();
      voices = voices.filter((v) => v.name.toLowerCase().includes(needle));
    }

    if (json) {
      printJson({ ok: true, command: "run-lines", action: "tts-voices", voices });
      return;
    }
    for (const v of voices) console.log(`${v.name}\t${v.gender}`);
    return;
  }

  if (sub === "set-voice") {
    const scriptIdRaw = actionArgs[0];
    if (!scriptIdRaw || !/^\d+$/.test(scriptIdRaw)) throw new Error("Usage: run-lines set-voice <script_id> --character <name> --voice <voice> [--rate +0%]");
    const scriptId = Number(scriptIdRaw);
    loadScriptOrThrow(db, scriptId);

    let character: string | null = null;
    let voice: string | null = null;
    let rate = "+0%";
    for (let i = 1; i < actionArgs.length; i += 1) {
      const a = actionArgs[i];
      const next = actionArgs[i + 1];
      if (a === "--character" && next) {
        character = next;
        i += 1;
        continue;
      }
      if (a === "--voice" && next) {
        voice = next;
        i += 1;
        continue;
      }
      if (a === "--rate" && next) {
        rate = next;
        i += 1;
        continue;
      }
    }

    if (!character || !voice) throw new Error("Usage: run-lines set-voice <script_id> --character <name> --voice <voice> [--rate +0%]");

    const norm = normalizeCharacterName(character);
    const existing = db
      .prepare("SELECT normalized_name FROM script_characters WHERE script_id = ? AND normalized_name = ? LIMIT 1")
      .get(scriptId, norm) as { normalized_name: string } | undefined;
    if (!existing) {
      throw new Error(`Unknown character for script ${scriptId}: ${character} (normalized: ${norm})`);
    }

    db.prepare("UPDATE script_characters SET voice = ?, rate = ? WHERE script_id = ? AND normalized_name = ?").run(voice, rate, scriptId, norm);

    if (json) {
      printJson({ ok: true, command: "run-lines", action: "set-voice", script_id: scriptId, character: norm, voice, rate });
      return;
    }
    console.log(`Set voice: ${norm} -> ${voice} (${rate})`);
    return;
  }

  if (sub === "lines") {
    const scriptIdRaw = actionArgs[0];
    if (!scriptIdRaw || !/^\d+$/.test(scriptIdRaw)) throw new Error("Usage: run-lines lines <script_id> [--from N] [--to M]");
    const scriptId = Number(scriptIdRaw);
    loadScriptOrThrow(db, scriptId);

    let from = 1;
    let to: number | null = null;
    for (let i = 1; i < actionArgs.length; i += 1) {
      const a = actionArgs[i];
      const next = actionArgs[i + 1];
      if (a === "--from" && next && /^\d+$/.test(next)) {
        from = Number(next);
        i += 1;
        continue;
      }
      if (a === "--to" && next && /^\d+$/.test(next)) {
        to = Number(next);
        i += 1;
        continue;
      }
    }

    const maxRow = db.prepare("SELECT MAX(idx) AS max_idx FROM script_lines WHERE script_id = ?").get(scriptId) as { max_idx: number | null };
    const maxIdx = Number(maxRow.max_idx ?? 0);
    const toFinal = to ?? maxIdx;

    const rows = db
      .prepare(
        `SELECT idx, type, speaker_normalized, text, scene_number, scene_heading
         FROM script_lines
         WHERE script_id = ? AND idx >= ? AND idx <= ?
         ORDER BY idx`,
      )
      .all(scriptId, from, toFinal) as Array<any>;

    if (json) {
      printJson({ ok: true, command: "run-lines", action: "lines", script_id: scriptId, from, to: toFinal, lines: rows });
      return;
    }
    for (const r of rows) {
      const speaker = r.speaker_normalized ? `${r.speaker_normalized}: ` : "";
      console.log(`${r.idx}\t${r.type}\t${speaker}${r.text}`);
    }
    return;
  }

  if (sub === "patch") {
    const scriptIdRaw = actionArgs[0];
    const patchKind = actionArgs[1];
    if (!scriptIdRaw || !/^\d+$/.test(scriptIdRaw) || !patchKind) {
      throw new Error("Usage: run-lines patch <script_id> <drop-range|merge|replace-text|set-speaker|set-type> ...");
    }
    const scriptId = Number(scriptIdRaw);
    loadScriptOrThrow(db, scriptId);

    if (patchKind === "drop-range") {
      let from: number | null = null;
      let to: number | null = null;
      for (let i = 2; i < actionArgs.length; i += 1) {
        const a = actionArgs[i];
        const next = actionArgs[i + 1];
        if (a === "--from" && next && /^\d+$/.test(next)) {
          from = Number(next);
          i += 1;
          continue;
        }
        if (a === "--to" && next && /^\d+$/.test(next)) {
          to = Number(next);
          i += 1;
          continue;
        }
      }
      if (from === null || to === null) throw new Error("Usage: run-lines patch <script_id> drop-range --from N --to M");
      db.prepare("DELETE FROM script_lines WHERE script_id = ? AND idx >= ? AND idx <= ?").run(scriptId, from, to);
      recordEdit(db, scriptId, "drop_range", { from, to });
      ensureContiguousIdx(db, scriptId);
      if (json) printJson({ ok: true, command: "run-lines", action: "patch", kind: "drop-range", script_id: scriptId, from, to });
      else console.log(`Dropped lines ${from}..${to}`);
      return;
    }

    if (patchKind === "merge") {
      let idx: number | null = null;
      let count = 2;
      for (let i = 2; i < actionArgs.length; i += 1) {
        const a = actionArgs[i];
        const next = actionArgs[i + 1];
        if (a === "--idx" && next && /^\d+$/.test(next)) {
          idx = Number(next);
          i += 1;
          continue;
        }
        if (a === "--count" && next && /^\d+$/.test(next)) {
          count = Math.max(2, Number(next));
          i += 1;
          continue;
        }
      }
      if (idx === null) throw new Error("Usage: run-lines patch <script_id> merge --idx N [--count 2]");

      const rows = db
        .prepare(
          `SELECT idx, type, speaker_normalized, text, scene_number, scene_heading
           FROM script_lines WHERE script_id = ? ORDER BY idx`,
        )
        .all(scriptId) as Array<any>;
      const pos = rows.findIndex((r) => Number(r.idx) === idx);
      if (pos < 0) throw new Error(`Unknown idx: ${idx}`);
      const slice = rows.slice(pos, pos + count);
      if (slice.length < 2) throw new Error(`Not enough lines to merge at idx ${idx} (count ${count})`);

      const first = slice[0]!;
      const mergedText = slice.map((r) => String(r.text ?? "").trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

      db.exec("BEGIN");
      try {
        db.prepare("UPDATE script_lines SET text = ? WHERE script_id = ? AND idx = ?").run(mergedText, scriptId, idx);
        for (const r of slice.slice(1)) {
          db.prepare("DELETE FROM script_lines WHERE script_id = ? AND idx = ?").run(scriptId, Number(r.idx));
        }
        recordEdit(db, scriptId, "merge", { idx, count });
        db.exec("COMMIT");
      } catch (e) {
        try {
          db.exec("ROLLBACK");
        } catch {
          // ignore
        }
        throw e;
      }

      ensureContiguousIdx(db, scriptId);
      if (json) printJson({ ok: true, command: "run-lines", action: "patch", kind: "merge", script_id: scriptId, idx, count, new_text: mergedText });
      else console.log(`Merged ${count} lines starting at idx ${idx}`);
      return;
    }

    if (patchKind === "replace-text") {
      let idx: number | null = null;
      let match: string | null = null;
      let withStr: string | null = null;
      for (let i = 2; i < actionArgs.length; i += 1) {
        const a = actionArgs[i];
        const next = actionArgs[i + 1];
        if (a === "--idx" && next && /^\d+$/.test(next)) {
          idx = Number(next);
          i += 1;
          continue;
        }
        if (a === "--match" && next) {
          match = next;
          i += 1;
          continue;
        }
        if (a === "--with" && next) {
          withStr = next;
          i += 1;
          continue;
        }
      }
      if (idx === null || !match || withStr === null) {
        throw new Error('Usage: run-lines patch <script_id> replace-text --idx N --match "<regex>" --with "<string>"');
      }

      const row = db
        .prepare("SELECT text FROM script_lines WHERE script_id = ? AND idx = ? LIMIT 1")
        .get(scriptId, idx) as { text: string } | undefined;
      if (!row) throw new Error(`Unknown idx: ${idx}`);
      const re = new RegExp(match, "g");
      const updated = String(row.text ?? "").replace(re, withStr);
      db.prepare("UPDATE script_lines SET text = ? WHERE script_id = ? AND idx = ?").run(updated, scriptId, idx);
      recordEdit(db, scriptId, "replace_text", { idx, match, with: withStr });
      if (json) printJson({ ok: true, command: "run-lines", action: "patch", kind: "replace-text", script_id: scriptId, idx, text: updated });
      else console.log(`Replaced text at idx ${idx}`);
      return;
    }

    if (patchKind === "set-speaker") {
      let idx: number | null = null;
      let speaker: string | null = null;
      for (let i = 2; i < actionArgs.length; i += 1) {
        const a = actionArgs[i];
        const next = actionArgs[i + 1];
        if (a === "--idx" && next && /^\d+$/.test(next)) {
          idx = Number(next);
          i += 1;
          continue;
        }
        if (a === "--speaker" && next) {
          speaker = next;
          i += 1;
          continue;
        }
      }
      if (idx === null || !speaker) throw new Error("Usage: run-lines patch <script_id> set-speaker --idx N --speaker <name>");
      const norm = normalizeCharacterName(speaker);
      db.prepare("UPDATE script_lines SET speaker_normalized = ? WHERE script_id = ? AND idx = ?").run(norm, scriptId, idx);
      recordEdit(db, scriptId, "set_speaker", { idx, speaker: norm });
      if (json) printJson({ ok: true, command: "run-lines", action: "patch", kind: "set-speaker", script_id: scriptId, idx, speaker: norm });
      else console.log(`Set speaker at idx ${idx} -> ${norm}`);
      return;
    }

    if (patchKind === "set-type") {
      let idx: number | null = null;
      let typeRaw: string | null = null;
      for (let i = 2; i < actionArgs.length; i += 1) {
        const a = actionArgs[i];
        const next = actionArgs[i + 1];
        if (a === "--idx" && next && /^\d+$/.test(next)) {
          idx = Number(next);
          i += 1;
          continue;
        }
        if (a === "--type" && next) {
          typeRaw = next;
          i += 1;
          continue;
        }
      }
      if (idx === null || !typeRaw) throw new Error("Usage: run-lines patch <script_id> set-type --idx N --type dialogue|scene|action|parenthetical");
      const type = parseScriptLineType(typeRaw);
      if (!type) throw new Error("Type must be dialogue|scene|action|parenthetical");
      db.prepare("UPDATE script_lines SET type = ? WHERE script_id = ? AND idx = ?").run(type, scriptId, idx);
      recordEdit(db, scriptId, "set_type", { idx, type });
      if (json) printJson({ ok: true, command: "run-lines", action: "patch", kind: "set-type", script_id: scriptId, idx, type });
      else console.log(`Set type at idx ${idx} -> ${type}`);
      return;
    }

    throw new Error(`Unknown patch kind: ${patchKind}`);
  }

  if (sub === "practice") {
    const scriptIdRaw = actionArgs[0];
    if (!scriptIdRaw || !/^\d+$/.test(scriptIdRaw)) throw new Error("Usage: run-lines practice <script_id> --me <name> [--mode practice|learn|boss] ...");
    const scriptId = Number(scriptIdRaw);
    loadScriptOrThrow(db, scriptId);

    let me: string | null = null;
    let readAll = false;
    let mode: "practice" | "learn" | "boss" = "practice";
    let from: number | null = null;
    let to: number | null = null;
    let loop: number | "forever" = 1;
    let pauseMult = 1.15;
    let pauseMinSec = 1.0;
    let pauseMaxSec = 12.0;
    let cueWords: number | null = null;
    let revealAfter: boolean | null = null;
    let printDirections = true;

    for (let i = 1; i < actionArgs.length; i += 1) {
      const a = actionArgs[i];
      const next = actionArgs[i + 1];
      if (a === "--me" && next) {
        me = next;
        i += 1;
        continue;
      }
      if (a === "--read-all") {
        readAll = true;
        continue;
      }
      if (a === "--mode" && next && (next === "practice" || next === "learn" || next === "boss")) {
        mode = next;
        i += 1;
        continue;
      }
      if (a === "--from" && next && /^\d+$/.test(next)) {
        from = Number(next);
        i += 1;
        continue;
      }
      if (a === "--to" && next && /^\d+$/.test(next)) {
        to = Number(next);
        i += 1;
        continue;
      }
      if (a === "--loop" && next) {
        const parsed = parseLoop(next);
        if (!parsed) throw new Error("Usage: --loop <N|forever>");
        loop = parsed;
        i += 1;
        continue;
      }
      if (a === "--pause-mult" && next && /^[0-9.]+$/.test(next)) {
        pauseMult = Number(next);
        i += 1;
        continue;
      }
      if (a === "--pause-min" && next && /^[0-9.]+$/.test(next)) {
        pauseMinSec = Number(next);
        i += 1;
        continue;
      }
      if (a === "--pause-max" && next && /^[0-9.]+$/.test(next)) {
        pauseMaxSec = Number(next);
        i += 1;
        continue;
      }
      if (a === "--cue-words" && next && /^\d+$/.test(next)) {
        cueWords = Number(next);
        i += 1;
        continue;
      }
      if (a === "--reveal-after") {
        revealAfter = true;
        continue;
      }
      if (a === "--no-reveal-after") {
        revealAfter = false;
        continue;
      }
      if (a === "--no-directions") {
        printDirections = false;
        continue;
      }
      if (a === "--directions") {
        printDirections = true;
        continue;
      }
    }

    if (!readAll && !me) throw new Error("Usage: run-lines practice <script_id> (--me <name> | --read-all) [--mode practice|learn|boss] ...");
    if (!commandExists("afplay")) throw new Error("afplay is required for audio playback");

    const meNorm = normalizeMeName(me ?? "__READ_ALL__");
    const startedMs = Date.now();

    // Determine default from/to.
    const maxRow = db.prepare("SELECT MAX(idx) AS max_idx FROM script_lines WHERE script_id = ?").get(scriptId) as { max_idx: number | null };
    const maxIdx = Number(maxRow.max_idx ?? 0);
    if (maxIdx <= 0) throw new Error("Script has no lines");

    let fromIdx = from ?? 1;
    const toIdx = to ?? maxIdx;

    // If user didn't pass --from, resume from progress.
    if (from === null) {
      const prog = db
        .prepare("SELECT last_idx FROM script_progress WHERE script_id = ? AND me_normalized = ? LIMIT 1")
        .get(scriptId, meNorm) as { last_idx: number } | undefined;
      if (prog?.last_idx && prog.last_idx >= 1 && prog.last_idx < maxIdx) fromIdx = prog.last_idx + 1;
    }

    const lineRows = db
      .prepare(
        `SELECT idx, type, speaker_normalized, text, scene_number, scene_heading
         FROM script_lines
         WHERE script_id = ?
         ORDER BY idx`,
      )
      .all(scriptId) as Array<any>;

    const charRows = db
      .prepare("SELECT normalized_name, name, voice, rate FROM script_characters WHERE script_id = ?")
      .all(scriptId) as Array<any>;

    const effectiveCueWords = cueWords ?? (mode === "boss" ? 0 : 5);
    const effectiveRevealAfter = revealAfter ?? (mode === "learn");

    const res = await runLinesSession({
      mode,
      me: me ?? "__READ_ALL__",
      readAll,
      lines: lineRows,
      characters: charRows,
      voiceFallback: { voice: "en-US-GuyNeural", rate: "+0%" },
      fromIdx,
      toIdx,
      loop,
      pauseMult,
      pauseMinSec,
      pauseMaxSec,
      cueWords: effectiveCueWords,
      revealAfter: effectiveRevealAfter,
      printDirections,
    });
    const durationMs = Math.max(0, Date.now() - startedMs);

    // Persist progress (skip in read-all mode to avoid polluting per-character resume state).
    if (!readAll) {
      db.prepare(
        `INSERT INTO script_progress (script_id, me_normalized, last_idx, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(script_id, me_normalized) DO UPDATE SET last_idx=excluded.last_idx, updated_at=excluded.updated_at`,
      ).run(scriptId, meNorm, res.last_idx);
    }

    // Log practice history for "recent scenes" shown in the acting break lane.
    db.prepare(
      `INSERT INTO script_practice_events
         (script_id, me_normalized, mode, read_all, from_idx, to_idx, loops_completed, last_idx, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(scriptId, meNorm, mode, readAll ? 1 : 0, fromIdx, toIdx, res.loops_completed, res.last_idx, durationMs);

    if (json) {
      printJson({ ok: true, command: "run-lines", action: "practice", script_id: scriptId, me: meNorm, ...res });
      return;
    }
    return;
  }

  throw new Error(`Unknown run-lines subcommand: ${sub}`);
}
