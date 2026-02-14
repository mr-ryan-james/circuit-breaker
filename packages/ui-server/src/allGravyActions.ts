import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { getSetting, setSetting } from "@circuit-breaker/core";

import { createBrainRunner, type BrainResult } from "./brainRunner.js";
import { openCoreDb } from "./coreDb.js";
import {
  AllGravyBrainOutputSchema,
  AllGravyBrainOutputJsonSchema,
  type AllGravyBrainOutput,
} from "./allGravyBrainOutput.js";
import {
  ensureAllGravySchema,
  getAllGravyPr,
  getAllGravyProposal,
  insertAllGravyBrainTurn,
  insertAllGravyPr,
  insertAllGravyProposal,
  listAllGravyBrainTurnsForPr,
  listAllGravyProposalsForPr,
  listLatestAllGravyPrs,
  makeAllGravyId,
  nextAllGravyBrainTurnIdx,
  nowIso,
  updateAllGravyPr,
  updateAllGravyProposal,
  type AllGravyPrStatus,
} from "./allGravyDb.js";
import {
  AllGravyPrFilterSchema,
  OwnerRepoSchema,
  approvePr,
  classifyPr,
  fetchExistingComments,
  fetchPrDetails,
  fetchPrFiles,
  fetchPrThreads,
  ghLogin,
  listPrsByFilter,
  postInlineComment,
  type AllGravyPrFilter,
  type PrFile,
} from "./allGravyGithub.js";
import type { BrainName } from "./spanishDb.js";

export type ActionHandler = {
  description: string;
  schema: z.ZodTypeAny;
  handler: (payload: any) => Promise<any>;
};

function repoRootFromHere(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../../");
}

function safeJsonParse(input: string): any | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  const tryParse = (s: string): any | null => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };

  const direct = tryParse(raw);
  if (direct !== null) return direct;

  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence && fence[1]) {
    const inner = fence[1].trim();
    const parsed = tryParse(inner);
    if (parsed !== null) return parsed;
  }

  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) {
    const slice = raw.slice(first, last + 1);
    const parsed = tryParse(slice);
    if (parsed !== null) return parsed;
  }

  return null;
}

function normalizeBrainName(input: unknown): BrainName {
  return input === "claude" ? "claude" : "codex";
}

const DEFAULT_REPOS = ["buttersolutions/api", "buttersolutions/native", "buttersolutions/org-admin"];
const CLAUDE_PROMPT_MAX_CHARS = 25_000;
const CODEX_PROMPT_MAX_CHARS = 120_000;

function parseReposSetting(raw: unknown): string[] | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  try {
    const parsed = JSON.parse(s) as unknown;
    const arr = z.array(OwnerRepoSchema).safeParse(parsed);
    if (!arr.success) return null;
    const repos = arr.data.map((r) => r.trim()).filter(Boolean);
    return repos.length > 0 ? repos : null;
  } catch {
    return null;
  }
}

function getRepos(db: ReturnType<typeof openCoreDb>["db"]): string[] {
  const parsed = parseReposSetting(getSetting(db, "allgravy_repos"));
  return parsed ?? DEFAULT_REPOS.slice();
}

function setRepos(db: ReturnType<typeof openCoreDb>["db"], repos: string[]): void {
  const normalized = repos.map((r) => r.trim()).filter(Boolean);
  setSetting(db, "allgravy_repos", JSON.stringify(normalized));
}

function getBrainSetting(db: ReturnType<typeof openCoreDb>["db"]): BrainName {
  return normalizeBrainName(getSetting(db, "allgravy_brain"));
}

function setBrainSetting(db: ReturnType<typeof openCoreDb>["db"], brain: BrainName): void {
  setSetting(db, "allgravy_brain", brain);
}

function getFilterSetting(db: ReturnType<typeof openCoreDb>["db"]): AllGravyPrFilter {
  const raw = getSetting(db, "allgravy_filter");
  const parsed = AllGravyPrFilterSchema.safeParse(raw);
  return parsed.success ? parsed.data : "review_requested";
}

function setFilterSetting(db: ReturnType<typeof openCoreDb>["db"], filter: AllGravyPrFilter): void {
  setSetting(db, "allgravy_filter", filter);
}

let cachedSystemPrompt: string | null = null;
function loadAllGravySystemPrompt(): string {
  if (cachedSystemPrompt) return cachedSystemPrompt;
  const root = repoRootFromHere();
  const p = path.join(root, "packages", "ui-server", "prompts", "allgravy_system_prompt.md");
  const txt = fs.readFileSync(p, "utf8");
  cachedSystemPrompt = txt;
  return txt;
}

function patchToNumberedLines(patch: string): string[] {
  const lines = String(patch ?? "").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const n = i + 1;
    out.push(`${String(n).padStart(4, " ")} ${lines[i] ?? ""}`);
  }
  return out;
}

function isCommentablePatchLine(line: string): boolean {
  const s = String(line ?? "");
  if (!s) return false;
  if (s.startsWith("diff --git ")) return false;
  if (s.startsWith("index ")) return false;
  if (s.startsWith("--- ")) return false;
  if (s.startsWith("+++ ")) return false;
  if (s.startsWith("@@")) return false;
  // Added line (+) or context line (" ") are typically safe.
  if (s.startsWith("+")) return true;
  if (s.startsWith(" ")) return true;
  // We allow "-" lines too (comment on removed line) but it's usually less useful.
  if (s.startsWith("-")) return true;
  return false;
}

function buildPatchesObject(files: PrFile[]): { patches: Record<string, { patch: string; numbered_lines: string[] }>; omitted: string[] } {
  const patches: Record<string, { patch: string; numbered_lines: string[] }> = {};
  const omitted: string[] = [];

  for (const f of files) {
    if (!f.patch) {
      omitted.push(f.filename);
      continue;
    }
    const numbered = patchToNumberedLines(f.patch);
    // Hard safety: if a patch is huge, we omit it (brain cannot reliably pick positions without full text).
    // This keeps prompts bounded and avoids partial patches with misleading positions.
    if (numbered.length > 1200) {
      omitted.push(f.filename);
      continue;
    }
    patches[f.filename] = { patch: f.patch, numbered_lines: numbered };
  }

  return { patches, omitted };
}

const BRAIN_OUTPUT_EXAMPLE = JSON.stringify(
  {
    v: 1,
    assistant_text: "string",
    proposals: [{ path: "path/to/file.ts", position: 123, body: "Tentative question-led comment..." }],
    await: "done",
  },
  null,
  2,
);

function allGravyRepairPrompt(args: { badOutput: string; attempt: number }): string {
  const clipped = String(args.badOutput ?? "").trim().slice(0, 2000);
  return [
    "Your previous message was NOT valid JSON that matched the required schema.",
    "",
    "Return EXACTLY ONE JSON object and NOTHING ELSE:",
    "- No markdown",
    "- No code fences",
    "- No extra commentary before/after",
    "",
    "It MUST match this schema example:",
    BRAIN_OUTPUT_EXAMPLE,
    "",
    `Repair attempt: ${args.attempt}`,
    "",
    "Re-emit your intended response (same content) but as a valid JSON object.",
    "",
    "Bad output (for reference):",
    clipped,
  ].join("\n");
}

async function parseAndValidateBrainOutput(
  db: ReturnType<typeof openCoreDb>["db"],
  prId: string,
  brainName: BrainName,
  run: BrainResult,
  opts: { stateDir: string; prStatus: AllGravyPrStatus; alreadyReviewed: boolean; isDraft: boolean },
): Promise<{ ok: true; brain: AllGravyBrainOutput; raw: string } | { ok: false; error: string; raw: string }> {
  let currentRun: BrainResult = run;
  let raw = String(currentRun.last_agent_message ?? "").trim();

  const maxRetries = brainName === "codex" ? 2 : 0;
  let parsed: ReturnType<typeof AllGravyBrainOutputSchema.safeParse> | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const obj = safeJsonParse(raw);
    parsed = AllGravyBrainOutputSchema.safeParse(obj);
    if (parsed.success) break;

    insertAllGravyBrainTurn(db, {
      id: makeAllGravyId("ag_turn"),
      pr_id: prId,
      idx: nextAllGravyBrainTurnIdx(db, prId),
      role: "assistant",
      kind: "brain_raw",
      content: raw,
      json: JSON.stringify({ brain: brainName, attempt, error: parsed.error?.issues?.[0]?.message ?? "schema_validation_failed" }),
    });

    if (attempt >= maxRetries) {
      return { ok: false, error: "bad_brain_output", raw };
    }

    const threadId = currentRun.thread_id;
    if (!threadId) return { ok: false, error: "missing_thread_id", raw };

    const runner = createBrainRunner(brainName);
    const logDir = path.join(opts.stateDir, "allgravy", brainName, prId);
    fs.mkdirSync(logDir, { recursive: true });

    const retry = await runner.run({
      cwd: repoRootFromHere(),
      prompt: allGravyRepairPrompt({ badOutput: raw, attempt: attempt + 1 }),
      resumeThreadId: threadId,
      timeoutMs: 90_000,
      logJsonlPath: path.join(logDir, `repair-${Date.now()}-attempt${attempt + 1}.jsonl`),
      jsonSchema: undefined,
    });

    if (!retry.ok) {
      insertAllGravyBrainTurn(db, {
        id: makeAllGravyId("ag_turn"),
        pr_id: prId,
        idx: nextAllGravyBrainTurnIdx(db, prId),
        role: "error",
        kind: "error",
        content: `Brain (${brainName}) failed during repair: ${retry.error}`,
        json: JSON.stringify(retry),
      });
      return { ok: false, error: "brain_failed", raw };
    }

    currentRun = retry;
    raw = String(currentRun.last_agent_message ?? "").trim();
  }

  if (!parsed?.success) return { ok: false, error: "bad_brain_output", raw };

  // Hard safety: if the PR is draft or already reviewed, we force proposals empty regardless of brain output.
  // This keeps the system aligned with the workflow rules even if the model drifts.
  const forced =
    opts.isDraft || opts.alreadyReviewed || opts.prStatus !== "new_unreviewed"
      ? { ...parsed.data, proposals: [] }
      : parsed.data;

  return { ok: true, brain: forced, raw };
}

function stringifyPromptPart(label: string, content: string): string {
  const s = String(content ?? "").trim();
  if (!s) return `${label}: (empty)`;
  return `${label}:\n${s}`;
}

export function createAllGravyActionHandlers(opts: { stateDir: string; wsBroadcast?: (msg: any) => void }): Record<string, ActionHandler> {
  const wsBroadcast = opts.wsBroadcast ?? (() => {});

  return {
    "allgravy.repos.get": {
      description: "Get All Gravy repo list for queue review.",
      schema: z.object({}),
      async handler() {
        const { db } = openCoreDb();
        try {
          const repos = getRepos(db);
          return { ok: true, repos };
        } finally {
          db.close();
        }
      },
    },
    "allgravy.repos.set": {
      description: "Set All Gravy repo list for queue review.",
      schema: z.object({ repos: z.array(OwnerRepoSchema).min(1).max(50) }),
      async handler(payload) {
        const { db } = openCoreDb();
        try {
          setRepos(db, payload.repos);
          return { ok: true, repos: getRepos(db) };
        } finally {
          db.close();
        }
      },
    },
    "allgravy.brain.get": {
      description: "Get the default brain for All Gravy proposal generation.",
      schema: z.object({}),
      async handler() {
        const { db } = openCoreDb();
        try {
          const brain = getBrainSetting(db);
          return { ok: true, brain };
        } finally {
          db.close();
        }
      },
    },
    "allgravy.brain.set": {
      description: "Set the default brain for All Gravy proposal generation.",
      schema: z.object({ brain: z.enum(["codex", "claude"]) }),
      async handler(payload) {
        const { db } = openCoreDb();
        try {
          setBrainSetting(db, payload.brain);
          return { ok: true, brain: getBrainSetting(db) };
        } finally {
          db.close();
        }
      },
    },
    "allgravy.filter.get": {
      description: "Get the PR filter mode for All Gravy queue refresh.",
      schema: z.object({}),
      async handler() {
        const { db } = openCoreDb();
        try {
          const filter = getFilterSetting(db);
          return { ok: true, filter };
        } finally {
          db.close();
        }
      },
    },
    "allgravy.filter.set": {
      description: "Set the PR filter mode for All Gravy queue refresh.",
      schema: z.object({ filter: AllGravyPrFilterSchema }),
      async handler(payload) {
        const { db } = openCoreDb();
        try {
          setFilterSetting(db, payload.filter);
          return { ok: true, filter: getFilterSetting(db) };
        } finally {
          db.close();
        }
      },
    },
    "allgravy.prs.latest": {
      description: "List latest All Gravy PR queue snapshot (most recent run).",
      schema: z.object({}),
      async handler() {
        const { db } = openCoreDb();
        try {
          ensureAllGravySchema(db);
          const latest = listLatestAllGravyPrs(db);
          return { ok: true, ...latest };
        } finally {
          db.close();
        }
      },
    },
    "allgravy.queue.refresh": {
      description: "Refresh the All Gravy PR review queue from GitHub (non-draft review-requested PRs).",
      schema: z.object({}),
      async handler() {
        const { db } = openCoreDb();
        const runId = makeAllGravyId("ag_run");
        const refreshedAt = nowIso();
        let repos: string[] = [];
        try {
          ensureAllGravySchema(db);
          repos = getRepos(db);
          const login = ghLogin();
          const filter = getFilterSetting(db);

          wsBroadcast({ type: "allgravy.queue", event: "started", run_id: runId, repos, refreshed_at: refreshedAt });

          let inserted = 0;
          const errors: Array<{ repo: string; error: string }> = [];

          for (const repo of repos) {
            let prs: ReturnType<typeof listPrsByFilter> = [];
            try {
              prs = listPrsByFilter(repo, login, filter);
            } catch (e: unknown) {
              errors.push({ repo, error: e instanceof Error ? e.message : String(e) });
              continue;
            }

            for (const p of prs) {
              try {
                const fetched = fetchPrThreads(repo, p.number);
                if (fetched.pr.isDraft) continue; // defensive
                const headSha = String(fetched.pr.headRefOid ?? "").trim();
                if (!headSha) continue;

                const classified = classifyPr(login, fetched.threads);
                const prId = makeAllGravyId("ag_pr");
                insertAllGravyPr(db, {
                  id: prId,
                  run_id: runId,
                  refreshed_at: refreshedAt,
                  gh_login: login,
                  repo,
                  pr_number: p.number,
                  pr_url: fetched.pr.url || p.url,
                  title: fetched.pr.title || p.title,
                  author_login: fetched.pr.author_login ?? p.author_login ?? null,
                  head_sha: headSha,
                  status: classified.status,
                  thread_summary_json: JSON.stringify({
                    ...classified.summary.counts,
                    threads: classified.summary.threads,
                  }),
                  patches_json: null,
                });
                inserted += 1;
              } catch (e: unknown) {
                errors.push({ repo, error: e instanceof Error ? e.message : String(e) });
              }
            }

            wsBroadcast({ type: "allgravy.queue", event: "progress", run_id: runId, repo, inserted });
          }

          const latest = listLatestAllGravyPrs(db);
          wsBroadcast({ type: "allgravy.queue", event: "completed", run_id: runId, inserted, errors });
          return { ok: true, run_id: runId, refreshed_at: refreshedAt, inserted, errors, prs: latest.prs };
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          wsBroadcast({ type: "allgravy.queue", event: "failed", run_id: runId, refreshed_at: refreshedAt, repos, error: message });
          return { ok: false, error: "queue_refresh_failed", details: message, run_id: runId, refreshed_at: refreshedAt, repos };
        } finally {
          db.close();
        }
      },
    },
    "allgravy.pr.get": {
      description: "Get a single All Gravy PR row by id.",
      schema: z.object({ pr_id: z.string().min(1) }),
      async handler(payload) {
        const { db } = openCoreDb();
        try {
          const pr = getAllGravyPr(db, payload.pr_id);
          if (!pr) return { ok: false, error: "pr_not_found" };
          return { ok: true, pr };
        } finally {
          db.close();
        }
      },
    },
    "allgravy.pr.context": {
      description: "Fetch changed file patches for a PR (from GitHub) and cache in DB.",
      schema: z.object({ pr_id: z.string().min(1), refresh: z.boolean().optional() }),
      async handler(payload) {
        const { db } = openCoreDb();
        try {
          const pr = getAllGravyPr(db, payload.pr_id);
          if (!pr) return { ok: false, error: "pr_not_found" };

          const shouldRefresh = Boolean(payload.refresh) || !pr.patches_json;
          if (!shouldRefresh && pr.patches_json) {
            const patches = safeJsonParse(pr.patches_json) ?? {};
            return { ok: true, pr, patches };
          }

          const details = fetchPrDetails(pr.repo, pr.pr_number);
          const files = fetchPrFiles(pr.repo, pr.pr_number);
          const { patches, omitted } = buildPatchesObject(files);
          const patchesJson = JSON.stringify({ patches, omitted });

          updateAllGravyPr(db, pr.id, {
            head_sha: details.head_sha || pr.head_sha,
            patches_json: patchesJson,
            pr_url: details.url || pr.pr_url,
            title: details.title || pr.title,
          });

          const next = getAllGravyPr(db, pr.id);
          return { ok: true, pr: next, patches: { patches, omitted } };
        } finally {
          db.close();
        }
      },
    },
    "allgravy.proposals.list": {
      description: "List proposals for a PR.",
      schema: z.object({ pr_id: z.string().min(1) }),
      async handler(payload) {
        const { db } = openCoreDb();
        try {
          const pr = getAllGravyPr(db, payload.pr_id);
          if (!pr) return { ok: false, error: "pr_not_found" };
          const proposals = listAllGravyProposalsForPr(db, payload.pr_id);
          return { ok: true, pr, proposals };
        } finally {
          db.close();
        }
      },
    },
    "allgravy.brain_turns.list": {
      description: "List brain turns for a PR (debug).",
      schema: z.object({ pr_id: z.string().min(1), limit: z.number().int().min(1).max(10_000).optional() }),
      async handler(payload) {
        const { db } = openCoreDb();
        try {
          const pr = getAllGravyPr(db, payload.pr_id);
          if (!pr) return { ok: false, error: "pr_not_found" };
          const turns = listAllGravyBrainTurnsForPr(db, payload.pr_id, payload.limit ?? 2000);
          return { ok: true, pr, turns };
        } finally {
          db.close();
        }
      },
    },
    "allgravy.proposals.generate": {
      description: "Generate up to 2 inline comment proposals for a new_unreviewed PR using the configured brain.",
      schema: z.object({ pr_id: z.string().min(1) }),
      async handler(payload) {
        const { db } = openCoreDb();
        try {
          const pr = getAllGravyPr(db, payload.pr_id);
          if (!pr) return { ok: false, error: "pr_not_found" };
          if (pr.status !== "new_unreviewed") return { ok: false, error: "not_new_unreviewed", status: pr.status };

          const threadSummary = safeJsonParse(pr.thread_summary_json) as any;
          const alreadyReviewed = Boolean(threadSummary?.threadsWithMyComments) && Number(threadSummary.threadsWithMyComments) > 0;
          if (alreadyReviewed) return { ok: false, error: "already_reviewed" };

          const details = fetchPrDetails(pr.repo, pr.pr_number);
          if (details.is_draft) return { ok: false, error: "is_draft" };

          // Fetch and cache patches.
          const files = fetchPrFiles(pr.repo, pr.pr_number);
          const { patches, omitted } = buildPatchesObject(files);
          const patchesJson = JSON.stringify({ patches, omitted });
          updateAllGravyPr(db, pr.id, { head_sha: details.head_sha || pr.head_sha, patches_json: patchesJson });

          // Discard any existing proposed (unapplied) proposals for this PR to avoid confusing duplicates.
          try {
            db.prepare(
              `UPDATE allgravy_proposals
               SET status = 'discarded', updated_at = ?
               WHERE pr_id = ? AND status = 'proposed'`,
            ).run(nowIso(), pr.id);
          } catch {
            // ignore
          }

          const existing = fetchExistingComments(pr.repo, pr.pr_number);

          const system = loadAllGravySystemPrompt();
          const promptParts: string[] = [];
          promptParts.push(stringifyPromptPart("PR", `${pr.repo}#${pr.pr_number} — ${details.title || pr.title}`));
          promptParts.push(stringifyPromptPart("PR_URL", details.url || pr.pr_url));
          promptParts.push(stringifyPromptPart("HEAD_SHA", details.head_sha || pr.head_sha));
          promptParts.push(stringifyPromptPart("IS_DRAFT", String(Boolean(details.is_draft))));
          promptParts.push(stringifyPromptPart("ALREADY_REVIEWED_BY_ME", String(Boolean(alreadyReviewed))));
          promptParts.push(stringifyPromptPart("PR_DESCRIPTION", details.body || ""));

          // Existing comments: include only a compact subset to reduce prompt bloat.
          const reviewCompact = (existing.review_comments ?? [])
            .slice(-40)
            .map((c) => `- [${c.user_login ?? "unknown"}] ${c.path ? `${c.path}: ` : ""}${String(c.body ?? "").trim().replace(/\\s+/g, " ").slice(0, 500)}`)
            .join("\n");
          const issueCompact = (existing.issue_comments ?? [])
            .slice(-20)
            .map((c) => `- [${c.user_login ?? "unknown"}] ${String(c.body ?? "").trim().replace(/\\s+/g, " ").slice(0, 500)}`)
            .join("\n");
          promptParts.push(stringifyPromptPart("EXISTING_INLINE_REVIEW_COMMENTS", reviewCompact || "(none)"));
          promptParts.push(stringifyPromptPart("EXISTING_ISSUE_COMMENTS", issueCompact || "(none)"));

          // Patches for the brain (1-based positions).
          const patchBlocks: string[] = [];
          const keys = Object.keys(patches).sort((a, b) => a.localeCompare(b));
          for (const filename of keys) {
            const entry = patches[filename];
            if (!entry) continue;
            patchBlocks.push(`FILE: ${filename}\nPATCH (1-based positions):\n${entry.numbered_lines.join("\n")}`);
          }
          if (omitted.length > 0) {
            patchBlocks.push(`OMITTED_FILES_NO_PATCH_OR_TOO_LARGE:\n${omitted.map((f) => `- ${f}`).join("\n")}`);
          }
          promptParts.push(stringifyPromptPart("CHANGED_FILE_PATCHES", patchBlocks.join("\n\n")));
          promptParts.push(stringifyPromptPart("OUTPUT_SCHEMA_EXAMPLE", BRAIN_OUTPUT_EXAMPLE));

          const userPrompt = promptParts.join("\n\n---\n\n");

          const brainName = getBrainSetting(db);
          const runner = createBrainRunner(brainName);

          const logDir = path.join(opts.stateDir, "allgravy", brainName, pr.id);
          fs.mkdirSync(logDir, { recursive: true });

          // Claude CLI takes the prompt as a positional argument; extremely large prompts can exceed OS argv limits.
          // Codex uses stdin injection, but we still cap aggregate prompt size to keep runs bounded and predictable.
          if (brainName === "claude" && userPrompt.length > CLAUDE_PROMPT_MAX_CHARS) {
            return { ok: false, error: "prompt_too_large_for_claude", chars: userPrompt.length, hint: "Use Codex for large PR diffs." };
          }
          if (brainName === "codex" && userPrompt.length > CODEX_PROMPT_MAX_CHARS) {
            return {
              ok: false,
              error: "prompt_too_large_for_codex",
              chars: userPrompt.length,
              limit: CODEX_PROMPT_MAX_CHARS,
              hint: "Reduce repo scope or split review into smaller chunks.",
            };
          }

          insertAllGravyBrainTurn(db, {
            id: makeAllGravyId("ag_turn"),
            pr_id: pr.id,
            idx: nextAllGravyBrainTurnIdx(db, pr.id),
            role: "system",
            kind: "prompt",
            content: `${system}\n\n${userPrompt}`.slice(0, 50_000),
            json: null,
          });

          wsBroadcast({ type: "allgravy.proposals", event: "started", pr_id: pr.id, brain: brainName });

          const run = await runner.run({
            cwd: repoRootFromHere(),
            systemPrompt: system,
            prompt: userPrompt,
            timeoutMs: 150_000,
            logJsonlPath: path.join(logDir, `turn0-${Date.now()}.jsonl`),
            jsonSchema: brainName === "claude" ? AllGravyBrainOutputJsonSchema : undefined,
          });

          if (!run.ok) {
            insertAllGravyBrainTurn(db, {
              id: makeAllGravyId("ag_turn"),
              pr_id: pr.id,
              idx: nextAllGravyBrainTurnIdx(db, pr.id),
              role: "error",
              kind: "error",
              content: `Brain (${brainName}) failed: ${run.error}`,
              json: JSON.stringify(run),
            });
            wsBroadcast({ type: "allgravy.proposals", event: "failed", pr_id: pr.id, error: "brain_failed" });
            return { ok: false, error: "brain_failed", details: run };
          }

          const processed = await parseAndValidateBrainOutput(db, pr.id, brainName, run, {
            stateDir: opts.stateDir,
            prStatus: pr.status,
            alreadyReviewed,
            isDraft: Boolean(details.is_draft),
          });

          if (!processed.ok) {
            insertAllGravyBrainTurn(db, {
              id: makeAllGravyId("ag_turn"),
              pr_id: pr.id,
              idx: nextAllGravyBrainTurnIdx(db, pr.id),
              role: "error",
              kind: "error",
              content: `bad brain output: ${processed.error}`,
              json: JSON.stringify({ raw: processed.raw }),
            });
            wsBroadcast({ type: "allgravy.proposals", event: "failed", pr_id: pr.id, error: processed.error });
            return { ok: false, error: processed.error, raw: processed.raw };
          }

          const brain = processed.brain;
          insertAllGravyBrainTurn(db, {
            id: makeAllGravyId("ag_turn"),
            pr_id: pr.id,
            idx: nextAllGravyBrainTurnIdx(db, pr.id),
            role: "assistant",
            kind: "brain_output",
            content: brain.assistant_text,
            json: JSON.stringify(brain),
          });

          const created: any[] = [];
          for (const prop of brain.proposals) {
            const fileEntry = patches[prop.path];
            if (!fileEntry) continue;
            const patchLines = fileEntry.patch.split("\n");
            const pos = Number(prop.position ?? NaN);
            if (!Number.isFinite(pos) || pos <= 0 || pos > patchLines.length) continue;
            const line = patchLines[pos - 1] ?? "";
            if (!isCommentablePatchLine(line)) continue;

            const id = makeAllGravyId("ag_prop");
            insertAllGravyProposal(db, {
              id,
              pr_id: pr.id,
              repo: pr.repo,
              pr_number: pr.pr_number,
              head_sha: details.head_sha || pr.head_sha,
              commit_id: details.head_sha || pr.head_sha,
              path: prop.path,
              position: pos,
              body: String(prop.body ?? "").trim(),
            });
            created.push({ id, ...prop, patch_line_preview: String(line).slice(0, 300) });
          }

          const proposals = listAllGravyProposalsForPr(db, pr.id);
          wsBroadcast({ type: "allgravy.proposals", event: "generated", pr_id: pr.id, proposals: created });

          return {
            ok: true,
            pr: getAllGravyPr(db, pr.id),
            brain,
            created,
            proposals,
            patches: { patches, omitted },
          };
        } finally {
          db.close();
        }
      },
    },
    "allgravy.comment.apply": {
      description: "Apply (post) a single proposed inline comment to GitHub.",
      schema: z.object({ proposal_id: z.string().min(1), body_override: z.string().max(2000).optional() }),
      async handler(payload) {
        const { db } = openCoreDb();
        try {
          const prop = getAllGravyProposal(db, payload.proposal_id);
          if (!prop) return { ok: false, error: "proposal_not_found" };
          if (prop.status !== "proposed") return { ok: false, error: "not_proposed", status: prop.status };

          const pr = getAllGravyPr(db, prop.pr_id);
          if (!pr) return { ok: false, error: "pr_not_found" };

          const current = fetchPrDetails(pr.repo, pr.pr_number);
          const currentHead = current.head_sha;
          if (!currentHead || currentHead !== prop.head_sha) {
            return { ok: false, error: "context_stale", current_head_sha: currentHead, proposal_head_sha: prop.head_sha };
          }

          const body = payload.body_override ? String(payload.body_override).trim() : prop.body;
          if (!body) return { ok: false, error: "empty_body" };

          const res = postInlineComment({
            repo: prop.repo,
            prNumber: prop.pr_number,
            commitId: prop.commit_id,
            path: prop.path,
            position: prop.position,
            body,
          });

          if (!res.ok) {
            updateAllGravyProposal(db, prop.id, {
              status: "failed",
              gh_command: res.command,
              apply_result_json: JSON.stringify({ ok: false, error: res.error, stdout: res.stdout, stderr: res.stderr }),
            });
            wsBroadcast({ type: "allgravy.comment", event: "failed", proposal_id: prop.id, error: res.error });
            return { ok: false, error: res.error, details: res };
          }

          updateAllGravyProposal(db, prop.id, {
            status: "applied",
            body,
            gh_command: res.command,
            apply_result_json: JSON.stringify({
              ok: true,
              comment_url: res.comment_url,
              comment_id: res.comment_id,
              stdout: res.stdout,
              stderr: res.stderr,
            }),
          });
          wsBroadcast({ type: "allgravy.comment", event: "applied", proposal_id: prop.id, comment_url: res.comment_url });
          return { ok: true, proposal: getAllGravyProposal(db, prop.id), result: res };
        } finally {
          db.close();
        }
      },
    },
    "allgravy.comment.discard": {
      description: "Discard a proposed comment locally (does not touch GitHub).",
      schema: z.object({ proposal_id: z.string().min(1) }),
      async handler(payload) {
        const { db } = openCoreDb();
        try {
          const prop = getAllGravyProposal(db, payload.proposal_id);
          if (!prop) return { ok: false, error: "proposal_not_found" };
          if (prop.status !== "proposed") return { ok: false, error: "not_proposed", status: prop.status };
          updateAllGravyProposal(db, prop.id, { status: "discarded" });
          wsBroadcast({ type: "allgravy.comment", event: "discarded", proposal_id: prop.id });
          return { ok: true, proposal: getAllGravyProposal(db, prop.id) };
        } finally {
          db.close();
        }
      },
    },
    "allgravy.pr.approve": {
      description: "Approve a PR (no approval body) if it's classified as ready_to_approve.",
      schema: z.object({ pr_id: z.string().min(1) }),
      async handler(payload) {
        const { db } = openCoreDb();
        try {
          const pr = getAllGravyPr(db, payload.pr_id);
          if (!pr) return { ok: false, error: "pr_not_found" };
          if (pr.status !== "ready_to_approve") return { ok: false, error: "not_ready_to_approve", status: pr.status };

          const details = fetchPrDetails(pr.repo, pr.pr_number);
          if (details.is_draft) return { ok: false, error: "is_draft" };

          const res = approvePr(pr.repo, pr.pr_number);
          if (!res.ok) return { ok: false, error: res.error, details: res };
          wsBroadcast({ type: "allgravy.pr", event: "approved", pr_id: pr.id, repo: pr.repo, pr_number: pr.pr_number });
          return { ok: true, command: res.command };
        } finally {
          db.close();
        }
      },
    },
  };
}
