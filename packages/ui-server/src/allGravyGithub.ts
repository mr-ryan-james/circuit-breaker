import { z } from "zod";

export type AllGravyPrFilter = "review_requested" | "all_by_others" | "all_open";
export const AllGravyPrFilterSchema = z.enum(["review_requested", "all_by_others", "all_open"]);

export type PrQueryOptions = {
  sinceDays?: number;
  excludeBots?: boolean;
};

export type GhRun = {
  ok: boolean;
  exit_code: number;
  stdout: string;
  stderr: string;
  command: string;
};

function runGh(args: string[], opts?: { cwd?: string }): GhRun {
  const command = ["gh", ...args].join(" ");
  const proc = Bun.spawnSync(["gh", ...args], {
    cwd: opts?.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = new TextDecoder().decode(proc.stdout ?? new Uint8Array());
  const stderr = new TextDecoder().decode(proc.stderr ?? new Uint8Array());
  const exitCode = proc.exitCode ?? -1;
  return { ok: exitCode === 0, exit_code: exitCode, stdout, stderr, command };
}

function ghJson(args: string[], opts?: { cwd?: string }): any {
  const res = runGh(args, opts);
  if (!res.ok) {
    const detail = res.stderr.trim() || res.stdout.trim() || `exit_code=${res.exit_code}`;
    throw new Error(`gh failed: ${detail}`);
  }
  try {
    return JSON.parse(res.stdout);
  } catch {
    throw new Error(`gh returned non-JSON output (first 4000 chars):\n${res.stdout.slice(0, 4000)}`);
  }
}

function ghText(args: string[], opts?: { cwd?: string }): string {
  const res = runGh(args, opts);
  if (!res.ok) {
    const detail = res.stderr.trim() || res.stdout.trim() || `exit_code=${res.exit_code}`;
    throw new Error(`gh failed: ${detail}`);
  }
  return res.stdout;
}

export function ghLogin(): string {
  return ghText(["api", "user", "--jq", ".login"]).trim();
}

export type ReviewRequestedPr = {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  author_login: string | null;
};

/** Builds the GitHub search query for the selected PR filter mode. */
export function buildPrFilterSearchQuery(login: string, filter: AllGravyPrFilter, opts?: PrQueryOptions): string {
  let query: string;
  switch (filter) {
    case "all_by_others":
      query = `is:pr is:open draft:false -author:${login}`;
      break;
    case "all_open":
      query = `is:pr is:open draft:false`;
      break;
    case "review_requested":
    default:
      query = `is:pr is:open draft:false review-requested:${login}`;
      break;
  }

  if (opts?.sinceDays && opts.sinceDays > 0) {
    const cutoff = new Date(Date.now() - opts.sinceDays * 86_400_000);
    query += ` updated:>=${cutoff.toISOString().slice(0, 10)}`;
  }

  if (opts?.excludeBots !== false) {
    query += ` -author:app/dependabot -author:app/dependabot-preview -author:app/renovate`;
  }

  return query;
}

/** Returns PR list filtered by the selected mode. */
export function listPrsByFilter(repo: string, login: string, filter: AllGravyPrFilter = "review_requested", opts?: PrQueryOptions): ReviewRequestedPr[] {
  const search = buildPrFilterSearchQuery(login, filter, opts);
  const raw = ghJson([
    "pr",
    "list",
    "-R",
    repo,
    "--state",
    "open",
    "--search",
    search,
    "--limit",
    "100",
    "--json",
    "number,title,url,isDraft,author",
  ]) as any[];

  const parsed: ReviewRequestedPr[] = [];
  for (const r of raw ?? []) {
    const number = Number(r?.number ?? NaN);
    const title = String(r?.title ?? "");
    const url = String(r?.url ?? "");
    const isDraft = Boolean(r?.isDraft);
    const author_login = r?.author?.login ? String(r.author.login) : null;
    if (!Number.isFinite(number) || number <= 0) continue;
    if (!url) continue;
    // Defensive: enforce draft exclusion even if the search parser changes.
    if (isDraft) continue;
    parsed.push({ number, title, url, isDraft, author_login });
  }
  return parsed;
}

function parseDt(s: string): number {
  // ISO timestamps from GitHub end with Z. Date.parse handles it.
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

export type ReviewThreadSummary = {
  threadId: string;
  resolved: boolean;
  outdated: boolean;
  myCommentSnippet: string;
  hasReplyAfterMyComment: boolean;
  reply: null | { author: string; createdAt: string; bodySnippet: string };
};

export type MyThreadCounts = {
  threadsWithMyComments: number;
  resolved: number;
  repliedNotResolved: number;
  noResponse: number;
};

export type MyThreadSummary = { counts: MyThreadCounts; threads: ReviewThreadSummary[] };

export function summarizeMyThreads(login: string, threads: any[]): MyThreadSummary {
  const mine: ReviewThreadSummary[] = [];

  for (const t of threads ?? []) {
    const comments = t?.comments?.nodes ?? [];
    const myComments = (comments as any[]).filter((c) => String(c?.author?.login ?? "") === login);
    if (myComments.length === 0) continue;

    const latestMy = myComments
      .slice()
      .sort((a, b) => parseDt(String(a?.createdAt ?? "")) - parseDt(String(b?.createdAt ?? "")))
      .at(-1);
    const latestMyTime = latestMy?.createdAt ? parseDt(String(latestMy.createdAt)) : 0;

    let reply: ReviewThreadSummary["reply"] = null;
    const sorted = (comments as any[]).slice().sort((a, b) => parseDt(String(a?.createdAt ?? "")) - parseDt(String(b?.createdAt ?? "")));
    for (const c of sorted) {
      const author = String(c?.author?.login ?? "");
      if (!author || author === login) continue;
      const createdAt = String(c?.createdAt ?? "");
      if (!createdAt) continue;
      if (parseDt(createdAt) <= latestMyTime) continue;
      const body = String(c?.body ?? "").trim();
      if (!body) continue;
      reply = {
        author,
        createdAt,
        bodySnippet: body.replace(/\s+/g, " ").slice(0, 200),
      };
      break;
    }

    mine.push({
      threadId: String(t?.id ?? ""),
      resolved: Boolean(t?.isResolved),
      outdated: Boolean(t?.isOutdated),
      myCommentSnippet: String(latestMy?.body ?? "").trim().replace(/\s+/g, " ").slice(0, 200),
      hasReplyAfterMyComment: reply !== null,
      reply,
    });
  }

  const counts: MyThreadCounts = {
    threadsWithMyComments: mine.length,
    resolved: mine.filter((x) => x.resolved).length,
    repliedNotResolved: mine.filter((x) => !x.resolved && x.hasReplyAfterMyComment).length,
    noResponse: mine.filter((x) => !x.resolved && !x.hasReplyAfterMyComment).length,
  };

  return { counts, threads: mine };
}

export type PrClassification = {
  status: "new_unreviewed" | "waiting" | "ready_to_approve";
  summary: MyThreadSummary;
};

export function classifyPr(login: string, threads: any[]): PrClassification {
  const summary = summarizeMyThreads(login, threads);
  if (summary.counts.threadsWithMyComments === 0) return { status: "new_unreviewed", summary };
  const addressed = summary.counts.noResponse === 0;
  return { status: addressed ? "ready_to_approve" : "waiting", summary };
}

const GRAPHQL_QUERY = `
query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      url
      title
      state
      isDraft
      mergedAt
      headRefOid
      author { login }
      reviewThreads(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          comments(first: 100) {
            nodes {
              databaseId
              author { login }
              body
              createdAt
            }
          }
        }
      }
    }
  }
}
`;

export type FetchPrThreadsResult = {
  pr: {
    url: string;
    title: string;
    state: string;
    isDraft: boolean;
    mergedAt: string | null;
    headRefOid: string;
    author_login: string | null;
  };
  threads: any[];
};

export function fetchPrThreads(repo: string, number: number): FetchPrThreadsResult {
  const [owner, name] = repo.split("/", 2);
  if (!owner || !name) throw new Error(`Invalid repo: ${repo}`);

  const threads: any[] = [];
  let after: string | null = null;

  while (true) {
    const args = [
      "api",
      "graphql",
      "-f",
      `query=${GRAPHQL_QUERY}`,
      "-f",
      `owner=${owner}`,
      "-f",
      `name=${name}`,
      "-F",
      `number=${number}`,
    ];
    if (after) args.push("-f", `after=${after}`);

    const data = ghJson(args) as any;
    const pr = data?.data?.repository?.pullRequest;
    if (!pr) throw new Error(`Missing pullRequest from GraphQL for ${repo}#${number}`);
    const nodes = pr?.reviewThreads?.nodes ?? [];
    threads.push(...nodes);
    const pageInfo = pr?.reviewThreads?.pageInfo;
    if (!pageInfo?.hasNextPage) {
      return {
        pr: {
          url: String(pr?.url ?? ""),
          title: String(pr?.title ?? ""),
          state: String(pr?.state ?? ""),
          isDraft: Boolean(pr?.isDraft),
          mergedAt: pr?.mergedAt ? String(pr.mergedAt) : null,
          headRefOid: String(pr?.headRefOid ?? ""),
          author_login: pr?.author?.login ? String(pr.author.login) : null,
        },
        threads,
      };
    }
    after = String(pageInfo?.endCursor ?? "");
    if (!after) {
      return {
        pr: {
          url: String(pr?.url ?? ""),
          title: String(pr?.title ?? ""),
          state: String(pr?.state ?? ""),
          isDraft: Boolean(pr?.isDraft),
          mergedAt: pr?.mergedAt ? String(pr.mergedAt) : null,
          headRefOid: String(pr?.headRefOid ?? ""),
          author_login: pr?.author?.login ? String(pr.author.login) : null,
        },
        threads,
      };
    }
  }
}

export type PrDetails = {
  body: string;
  head_sha: string;
  is_draft: boolean;
  url: string;
  title: string;
};

export function fetchPrDetails(repo: string, prNumber: number): PrDetails {
  const raw = ghJson(["api", `repos/${repo}/pulls/${prNumber}`]) as any;
  return {
    body: String(raw?.body ?? ""),
    head_sha: String(raw?.head?.sha ?? ""),
    is_draft: Boolean(raw?.draft),
    url: String(raw?.html_url ?? ""),
    title: String(raw?.title ?? ""),
  };
}

export type PrFile = { filename: string; patch: string | null; status: string | null };

export function fetchPrFiles(repo: string, prNumber: number): PrFile[] {
  const raw = ghJson(["api", `repos/${repo}/pulls/${prNumber}/files`, "--paginate"]) as any[];
  const files: PrFile[] = [];
  for (const f of raw ?? []) {
    const filename = String(f?.filename ?? "");
    if (!filename) continue;
    const patch = typeof f?.patch === "string" ? String(f.patch) : null;
    const status = f?.status ? String(f.status) : null;
    files.push({ filename, patch, status });
  }
  return files;
}

export type ExistingReviewComment = { user_login: string | null; body: string; path: string | null; created_at: string | null };
export type ExistingIssueComment = { user_login: string | null; body: string; created_at: string | null };

export function fetchExistingComments(repo: string, prNumber: number): {
  review_comments: ExistingReviewComment[];
  issue_comments: ExistingIssueComment[];
} {
  const reviewRaw = ghJson(["api", `repos/${repo}/pulls/${prNumber}/comments`, "--paginate"]) as any[];
  const issueRaw = ghJson(["api", `repos/${repo}/issues/${prNumber}/comments`, "--paginate"]) as any[];

  const review_comments: ExistingReviewComment[] = (reviewRaw ?? []).map((c) => ({
    user_login: c?.user?.login ? String(c.user.login) : null,
    body: String(c?.body ?? ""),
    path: c?.path ? String(c.path) : null,
    created_at: c?.created_at ? String(c.created_at) : null,
  }));

  const issue_comments: ExistingIssueComment[] = (issueRaw ?? []).map((c) => ({
    user_login: c?.user?.login ? String(c.user.login) : null,
    body: String(c?.body ?? ""),
    created_at: c?.created_at ? String(c.created_at) : null,
  }));

  return { review_comments, issue_comments };
}

export type PostInlineCommentResult =
  | {
      ok: true;
      command: string;
      comment_url: string | null;
      comment_id: number | null;
      stdout: string;
      stderr: string;
    }
  | {
      ok: false;
      command: string;
      error: string;
      stdout: string;
      stderr: string;
    };

export function postInlineComment(params: {
  repo: string;
  prNumber: number;
  commitId: string;
  path: string;
  position: number;
  body: string;
}): PostInlineCommentResult {
  const dryRun = (process.env["CIRCUIT_BREAKER_ALLGRAVY_DRY_RUN"] ?? "").trim() === "1";
  const args = [
    "api",
    `repos/${params.repo}/pulls/${params.prNumber}/comments`,
    "--method",
    "POST",
    "-f",
    `body=${params.body}`,
    "-f",
    `commit_id=${params.commitId}`,
    "-f",
    `path=${params.path}`,
    "-F",
    `position=${params.position}`,
  ];

  if (dryRun) {
    return {
      ok: true,
      command: ["gh", ...args].join(" "),
      comment_url: null,
      comment_id: null,
      stdout: JSON.stringify({ ok: true, dry_run: true }),
      stderr: "",
    };
  }

  const res = runGh(args);
  if (!res.ok) {
    return { ok: false, command: res.command, error: "gh_failed", stdout: res.stdout, stderr: res.stderr };
  }

  let parsed: any = null;
  try {
    parsed = JSON.parse(res.stdout);
  } catch {
    // ignore
  }

  return {
    ok: true,
    command: res.command,
    comment_url: parsed?.html_url ? String(parsed.html_url) : null,
    comment_id: typeof parsed?.id === "number" ? parsed.id : null,
    stdout: res.stdout,
    stderr: res.stderr,
  };
}

export function approvePr(repo: string, prNumber: number): { ok: true; command: string } | { ok: false; command: string; error: string; stdout: string; stderr: string } {
  const dryRun = (process.env["CIRCUIT_BREAKER_ALLGRAVY_DRY_RUN"] ?? "").trim() === "1";
  const args = ["pr", "review", String(prNumber), "-R", repo, "--approve"];
  if (dryRun) return { ok: true, command: ["gh", ...args].join(" ") };
  const res = runGh(args);
  if (!res.ok) return { ok: false, command: res.command, error: "gh_failed", stdout: res.stdout, stderr: res.stderr };
  return { ok: true, command: res.command };
}

// A small zod helper for validating repos config at the boundary.
export const OwnerRepoSchema = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
