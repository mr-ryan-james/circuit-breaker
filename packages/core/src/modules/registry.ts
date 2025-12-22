import fs from "node:fs";
import path from "node:path";

import type { ModuleDefinition } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeSlug(raw: string): string {
  return raw.trim();
}

function normalizeTag(raw: string): string {
  return raw.trim();
}

export function moduleMatchesTags(module: ModuleDefinition, tags: string[]): boolean {
  const wanted = module.match.tags_any;
  if (!Array.isArray(wanted) || wanted.length === 0) return false;
  const tagSet = new Set(tags.map((t) => t.trim()).filter(Boolean));
  return wanted.some((t) => tagSet.has(t));
}

export function loadModulesFromDir(dirPath: string): ModuleDefinition[] {
  if (!fs.existsSync(dirPath)) return [];

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const jsonFiles = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".json"))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  const modules: ModuleDefinition[] = [];
  const seenSlugs = new Set<string>();

  for (const filename of jsonFiles) {
    const fullPath = path.join(dirPath, filename);
    const raw = fs.readFileSync(fullPath, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Invalid JSON in module file: ${fullPath}`);
    }

    if (!isRecord(parsed)) throw new Error(`Invalid module file (expected object): ${fullPath}`);

    const version = parsed["version"];
    if (version !== 1) throw new Error(`Unsupported module version in ${fullPath}: ${String(version)}`);

    const slugRaw = parsed["slug"];
    const nameRaw = parsed["name"];
    const matchRaw = parsed["match"];

    if (!isNonEmptyString(slugRaw)) throw new Error(`Module missing slug: ${fullPath}`);
    if (!isNonEmptyString(nameRaw)) throw new Error(`Module missing name: ${fullPath}`);
    if (!isRecord(matchRaw)) throw new Error(`Module missing match object: ${fullPath}`);

    const slug = normalizeSlug(slugRaw);
    const name = nameRaw.trim();

    if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug)) {
      throw new Error(`Invalid module slug "${slug}" in ${fullPath}. Use lowercase letters/numbers/_/- only.`);
    }
    if (seenSlugs.has(slug)) throw new Error(`Duplicate module slug "${slug}" in ${fullPath}`);
    seenSlugs.add(slug);

    const tagsAnyRaw = matchRaw["tags_any"];
    if (!Array.isArray(tagsAnyRaw)) throw new Error(`Module match.tags_any must be an array in ${fullPath}`);
    const tagsAny = tagsAnyRaw
      .map(String)
      .map(normalizeTag)
      .filter(Boolean);
    if (tagsAny.length === 0) throw new Error(`Module match.tags_any must have at least one tag in ${fullPath}`);

    const completionRaw = parsed["completion"];
    let completion: ModuleDefinition["completion"] | undefined;
    if (completionRaw !== undefined) {
      if (!isRecord(completionRaw)) throw new Error(`Module completion must be an object in ${fullPath}`);
      const partsRaw = completionRaw["parts_suggestions"];
      let partsSuggestions: string[] | undefined;
      if (partsRaw !== undefined) {
        if (!Array.isArray(partsRaw)) throw new Error(`completion.parts_suggestions must be an array in ${fullPath}`);
        partsSuggestions = partsRaw.map(String).map((s) => s.trim()).filter(Boolean);
      }
      completion = { parts_suggestions: partsSuggestions };
    }

    modules.push({
      version: 1,
      slug,
      name,
      match: { tags_any: tagsAny },
      completion,
    });
  }

  return modules.sort((a, b) => a.slug.localeCompare(b.slug));
}

