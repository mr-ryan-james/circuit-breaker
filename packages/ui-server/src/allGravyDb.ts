import crypto from "node:crypto";

import type { SqliteDb } from "@circuit-breaker/shared-sqlite";

export type AllGravyPrStatus = "new_unreviewed" | "waiting" | "ready_to_approve";
export type AllGravyProposalStatus = "proposed" | "applied" | "discarded" | "failed";

export type AllGravyPrRow = {
  id: string;
  run_id: string;
  refreshed_at: string;
  gh_login: string;
  repo: string;
  pr_number: number;
  pr_url: string;
  title: string;
  author_login: string | null;
  head_sha: string;
  status: AllGravyPrStatus;
  thread_summary_json: string;
  patches_json: string | null;
  created_at: string;
  updated_at: string;
};

export type AllGravyProposalRow = {
  id: string;
  pr_id: string;
  repo: string;
  pr_number: number;
  head_sha: string;
  commit_id: string;
  path: string;
  position: number;
  body: string;
  status: AllGravyProposalStatus;
  gh_command: string | null;
  apply_result_json: string | null;
  created_at: string;
  updated_at: string;
};

export type AllGravyBrainTurnRow = {
  id: string;
  pr_id: string;
  idx: number;
  role: "system" | "user" | "assistant" | "error";
  kind: "prompt" | "brain_output" | "brain_raw" | "error";
  content: string | null;
  json: string | null;
  created_at: string;
};

export function makeAllGravyId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function ensureAllGravySchema(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS allgravy_prs (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      refreshed_at TEXT NOT NULL,
      gh_login TEXT NOT NULL,
      repo TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      pr_url TEXT NOT NULL,
      title TEXT NOT NULL,
      author_login TEXT,
      head_sha TEXT NOT NULL,
      status TEXT NOT NULL,
      thread_summary_json TEXT NOT NULL,
      patches_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_allgravy_prs_run_id ON allgravy_prs(run_id);
    CREATE INDEX IF NOT EXISTS idx_allgravy_prs_refreshed_at ON allgravy_prs(refreshed_at);
    CREATE INDEX IF NOT EXISTS idx_allgravy_prs_status ON allgravy_prs(status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_allgravy_prs_run_repo_num ON allgravy_prs(run_id, repo, pr_number);

    CREATE TABLE IF NOT EXISTS allgravy_proposals (
      id TEXT PRIMARY KEY,
      pr_id TEXT NOT NULL,
      repo TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      head_sha TEXT NOT NULL,
      commit_id TEXT NOT NULL,
      path TEXT NOT NULL,
      position INTEGER NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'proposed',
      gh_command TEXT,
      apply_result_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_allgravy_proposals_pr_id ON allgravy_proposals(pr_id);
    CREATE INDEX IF NOT EXISTS idx_allgravy_proposals_status ON allgravy_proposals(status);

    CREATE TABLE IF NOT EXISTS allgravy_brain_turns (
      id TEXT PRIMARY KEY,
      pr_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      role TEXT NOT NULL,
      kind TEXT NOT NULL,
      content TEXT,
      json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_allgravy_brain_turns_pr_id_idx ON allgravy_brain_turns(pr_id, idx);
  `);
}

export function insertAllGravyPr(
  db: SqliteDb,
  row: Omit<AllGravyPrRow, "created_at" | "updated_at" | "patches_json"> & { patches_json?: string | null },
): void {
  const ts = nowIso();
  db.prepare(
    `INSERT INTO allgravy_prs
      (id, run_id, refreshed_at, gh_login, repo, pr_number, pr_url, title, author_login, head_sha, status, thread_summary_json, patches_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.run_id,
    row.refreshed_at,
    row.gh_login,
    row.repo,
    row.pr_number,
    row.pr_url,
    row.title,
    row.author_login ?? null,
    row.head_sha,
    row.status,
    row.thread_summary_json,
    row.patches_json ?? null,
    ts,
    ts,
  );
}

export function updateAllGravyPr(
  db: SqliteDb,
  id: string,
  patch: Partial<Pick<AllGravyPrRow, "head_sha" | "status" | "thread_summary_json" | "patches_json" | "title" | "pr_url" | "author_login">>,
): void {
  const existing = getAllGravyPr(db, id);
  if (!existing) return;
  const next: AllGravyPrRow = {
    ...existing,
    ...patch,
    updated_at: nowIso(),
    patches_json: patch.patches_json !== undefined ? patch.patches_json : existing.patches_json,
    author_login: patch.author_login !== undefined ? patch.author_login : existing.author_login,
  };

  db.prepare(
    `UPDATE allgravy_prs
     SET updated_at = ?,
         pr_url = ?,
         title = ?,
         author_login = ?,
         head_sha = ?,
         status = ?,
         thread_summary_json = ?,
         patches_json = ?
     WHERE id = ?`,
  ).run(
    next.updated_at,
    next.pr_url,
    next.title,
    next.author_login,
    next.head_sha,
    next.status,
    next.thread_summary_json,
    next.patches_json,
    id,
  );
}

export function getAllGravyPr(db: SqliteDb, id: string): AllGravyPrRow | null {
  const row = db.prepare(`SELECT * FROM allgravy_prs WHERE id = ?`).get(id) as any;
  return row ?? null;
}

export function getLatestAllGravyRunId(db: SqliteDb): string | null {
  const row = db.prepare(`SELECT run_id FROM allgravy_prs ORDER BY refreshed_at DESC LIMIT 1`).get() as
    | { run_id?: string }
    | undefined;
  const runId = typeof row?.run_id === "string" ? row.run_id : null;
  return runId && runId.trim() ? runId : null;
}

export function listAllGravyPrsForRun(db: SqliteDb, run_id: string): AllGravyPrRow[] {
  return db
    .prepare(
      `SELECT *
       FROM allgravy_prs
       WHERE run_id = ?
       ORDER BY
         CASE status
           WHEN 'ready_to_approve' THEN 0
           WHEN 'waiting' THEN 1
           WHEN 'new_unreviewed' THEN 2
           ELSE 9
         END,
         repo ASC,
         pr_number ASC`,
    )
    .all(run_id) as any[];
}

export function listLatestAllGravyPrs(db: SqliteDb): { run_id: string | null; prs: AllGravyPrRow[] } {
  const runId = getLatestAllGravyRunId(db);
  if (!runId) return { run_id: null, prs: [] };
  return { run_id: runId, prs: listAllGravyPrsForRun(db, runId) };
}

export function insertAllGravyProposal(
  db: SqliteDb,
  row: Omit<AllGravyProposalRow, "created_at" | "updated_at" | "gh_command" | "apply_result_json" | "status"> & {
    status?: AllGravyProposalStatus;
    gh_command?: string | null;
    apply_result_json?: string | null;
  },
): void {
  const ts = nowIso();
  db.prepare(
    `INSERT INTO allgravy_proposals
      (id, pr_id, repo, pr_number, head_sha, commit_id, path, position, body, status, gh_command, apply_result_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.pr_id,
    row.repo,
    row.pr_number,
    row.head_sha,
    row.commit_id,
    row.path,
    row.position,
    row.body,
    row.status ?? "proposed",
    row.gh_command ?? null,
    row.apply_result_json ?? null,
    ts,
    ts,
  );
}

export function getAllGravyProposal(db: SqliteDb, id: string): AllGravyProposalRow | null {
  const row = db.prepare(`SELECT * FROM allgravy_proposals WHERE id = ?`).get(id) as any;
  return row ?? null;
}

export function listAllGravyProposalsForPr(db: SqliteDb, pr_id: string): AllGravyProposalRow[] {
  return db
    .prepare(
      `SELECT *
       FROM allgravy_proposals
       WHERE pr_id = ?
       ORDER BY
         CASE status
           WHEN 'proposed' THEN 0
           WHEN 'failed' THEN 1
           WHEN 'applied' THEN 2
           WHEN 'discarded' THEN 3
           ELSE 9
         END,
         created_at ASC`,
    )
    .all(pr_id) as any[];
}

export function updateAllGravyProposal(
  db: SqliteDb,
  id: string,
  patch: Partial<Pick<AllGravyProposalRow, "body" | "status" | "gh_command" | "apply_result_json">>,
): void {
  const existing = getAllGravyProposal(db, id);
  if (!existing) return;
  const next: AllGravyProposalRow = {
    ...existing,
    ...patch,
    updated_at: nowIso(),
    gh_command: patch.gh_command !== undefined ? patch.gh_command : existing.gh_command,
    apply_result_json: patch.apply_result_json !== undefined ? patch.apply_result_json : existing.apply_result_json,
  };

  db.prepare(
    `UPDATE allgravy_proposals
     SET updated_at = ?,
         body = ?,
         status = ?,
         gh_command = ?,
         apply_result_json = ?
     WHERE id = ?`,
  ).run(next.updated_at, next.body, next.status, next.gh_command, next.apply_result_json, id);
}

export function insertAllGravyBrainTurn(db: SqliteDb, row: Omit<AllGravyBrainTurnRow, "created_at">): void {
  db.prepare(
    `INSERT INTO allgravy_brain_turns
      (id, pr_id, idx, role, kind, content, json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(row.id, row.pr_id, row.idx, row.role, row.kind, row.content ?? null, row.json ?? null, nowIso());
}

export function nextAllGravyBrainTurnIdx(db: SqliteDb, pr_id: string): number {
  const row = db
    .prepare(`SELECT COALESCE(MAX(idx), -1) AS max_idx FROM allgravy_brain_turns WHERE pr_id = ?`)
    .get(pr_id) as any;
  const max = Number(row?.max_idx ?? -1);
  return Number.isFinite(max) ? max + 1 : 0;
}

export function listAllGravyBrainTurnsForPr(db: SqliteDb, pr_id: string, limit = 2000): AllGravyBrainTurnRow[] {
  return db
    .prepare(
      `SELECT *
       FROM allgravy_brain_turns
       WHERE pr_id = ?
       ORDER BY idx ASC
       LIMIT ?`,
    )
    .all(pr_id, limit) as any[];
}

