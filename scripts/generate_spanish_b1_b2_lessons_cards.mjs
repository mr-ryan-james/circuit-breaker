import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function repoRootFromHere() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..");
}

function extractGlobalPromptPrefix(markdown) {
  const startToken = "<!-- GLOBAL_PROMPT_PREFIX_START -->";
  const endToken = "<!-- GLOBAL_PROMPT_PREFIX_END -->";
  const startIdx = markdown.indexOf(startToken);
  const endIdx = markdown.indexOf(endToken);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error(`Global prompt prefix markers not found (expected ${startToken} ... ${endToken}).`);
  }
  return markdown.slice(startIdx + startToken.length, endIdx).trim();
}

function topicTagFromKey(key) {
  const match = key.match(/^learning\.spanish\.grammar\.([^.]+)\.v\d+$/);
  const slug = match?.[1] ?? "";

  if (slug.startsWith("subjunctive_")) return "subjunctive";
  if (slug.startsWith("subj_ind_")) return "subjunctive_vs_indicative";
  if (slug.startsWith("conditional_") || slug.startsWith("si_clauses_")) return "conditional";
  if (slug.startsWith("perfect_")) return "perfect";
  if (slug.startsWith("imperative_")) return "imperative";
  if (slug.startsWith("ser_estar_")) return "ser_estar";
  if (slug.startsWith("pret_imp_")) return "preterite_imperfect";
  if (slug.startsWith("por_para_")) return "por_para";
  if (slug.startsWith("pronouns_")) return "pronouns";
  if (slug.startsWith("passive_")) return "passive";
  if (
    slug.startsWith("progressive_") ||
    slug.startsWith("gerund_") ||
    slug.startsWith("infinitive_") ||
    slug.startsWith("participle_") ||
    slug.startsWith("verb_forms_")
  ) {
    return "verb_forms";
  }
  if (slug.startsWith("periphrasis_") || slug.startsWith("expressions_")) return "expressions";

  return "grammar";
}

function parseLessons(markdown) {
  const lessonRe =
    /^####\s+(\d+)\.\s+`([^`]+)`\s*\n\n\*\*Activity:\*\*\s*(.*?)\n\n\*\*Prompt:\*\*\n```\n([\s\S]*?)\n```/gm;
  const lessons = [];

  for (;;) {
    const match = lessonRe.exec(markdown);
    if (!match) break;
    const number = Number(match[1]);
    const key = String(match[2]).trim();
    const activity = String(match[3]).trim();
    const prompt = String(match[4]).trim();
    lessons.push({ number, key, activity, prompt });
  }

  return lessons;
}

function assertUnique(keys) {
  const seen = new Set();
  const dups = [];
  for (const k of keys) {
    if (seen.has(k)) dups.push(k);
    seen.add(k);
  }
  if (dups.length > 0) throw new Error(`Duplicate lesson keys found: ${dups.slice(0, 5).join(", ")}`);
}

async function main() {
  const repoRoot = repoRootFromHere();
  const inputPath = path.join(repoRoot, "data", "cards", "SPANISH_B1_B2_LESSONS_REVIEW.md");
  const outputPath = path.join(repoRoot, "data", "cards", "spanish_grammar_b1_b2_lessons.json");

  const markdown = await fs.readFile(inputPath, "utf8");
  const globalPrefix = extractGlobalPromptPrefix(markdown);
  const lessons = parseLessons(markdown);

  if (lessons.length !== 150) {
    throw new Error(`Expected 150 lessons, found ${lessons.length}.`);
  }
  assertUnique(lessons.map((l) => l.key));

  const baseTags = ["spanish", "grammar", "lesson", "b1b2"];
  const doneCondition = "after explanation, examples, and 15 quiz questions completed";

  const cards = lessons
    .sort((a, b) => a.number - b.number)
    .map((l) => {
      const topic = topicTagFromKey(l.key);
      const tags = topic && !baseTags.includes(topic) ? [...baseTags, topic] : baseTags;
      return {
        key: l.key,
        category: "learning",
        minutes: 10,
        activity: l.activity,
        done_condition: doneCondition,
        prompt: `${globalPrefix}\n\n${l.prompt}`.trim(),
        location: "any",
        rarity: "common",
        tags,
        active: true,
      };
    });

  await fs.writeFile(outputPath, `${JSON.stringify(cards, null, 2)}\n`, "utf8");
  process.stdout.write(`Wrote ${cards.length} cards → ${path.relative(repoRoot, outputPath)}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err?.stack ?? String(err)}\n`);
  process.exitCode = 1;
});
