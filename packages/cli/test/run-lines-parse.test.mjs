import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function requireFile(p) {
  if (!fs.existsSync(p)) throw new Error(`Missing file: ${p} (run \`pnpm build\` first)`); // eslint-disable-line no-throw-literal
}

test("colon parser excludes speaker labels and extracts parentheticals", async () => {
  const parsePath = path.join(__dirname, "..", "dist", "acting", "parse.js");
  requireFile(parsePath);
  const { parseColonScript } = await import(parsePath);

  const sample = fs.readFileSync(path.join(__dirname, "fixtures", "colon_sample.txt"), "utf8");
  const ir = parseColonScript(sample, "Colon Sample");

  assert.equal(ir.source_format, "colon");
  const dialogue = ir.lines.filter((l) => l.type === "dialogue");
  assert.ok(dialogue.length >= 2);
  for (const l of dialogue) {
    assert.ok(!/^[A-Z][A-Z0-9 .'-]{1,25}:\s+/.test(l.text), `speaker prefix leaked into dialogue text: ${l.text}`);
  }

  const parentheticals = ir.lines.filter((l) => l.type === "parenthetical");
  assert.ok(parentheticals.length >= 1);
  assert.match(parentheticals[0].text.toLowerCase(), /quiet/i);
});

test("fountain parser detects scenes, cues, and dialogue", async () => {
  const parsePath = path.join(__dirname, "..", "dist", "acting", "parse.js");
  requireFile(parsePath);
  const { parseFountainScript } = await import(parsePath);

  const sample = fs.readFileSync(path.join(__dirname, "fixtures", "fountain_sample.fountain"), "utf8");
  const ir = parseFountainScript(sample, "Fountain Sample");

  assert.equal(ir.source_format, "fountain");
  assert.ok(ir.lines.some((l) => l.type === "scene"));
  const dialogue = ir.lines.filter((l) => l.type === "dialogue");
  assert.ok(dialogue.length >= 2);
  for (const l of dialogue) {
    assert.ok(!/^[A-Z][A-Z0-9 .'-]{1,25}:\s+/.test(l.text));
    assert.ok(l.speaker_normalized);
  }
});

