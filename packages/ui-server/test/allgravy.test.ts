import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, mock, test } from "bun:test";
import { z } from "zod";

import { classifyPr, summarizeMyThreads } from "../src/allGravyGithub.js";

function thread(args: {
  id?: string;
  isResolved?: boolean;
  isOutdated?: boolean;
  comments: Array<{ author: string; body: string; createdAt: string }>;
}): any {
  return {
    id: args.id ?? "t1",
    isResolved: Boolean(args.isResolved),
    isOutdated: Boolean(args.isOutdated),
    comments: {
      nodes: args.comments.map((c) => ({
        author: { login: c.author },
        body: c.body,
        createdAt: c.createdAt,
      })),
    },
  };
}

test("allgravy classify: no my comments => new_unreviewed", () => {
  const res = classifyPr("me", [
    thread({
      comments: [
        { author: "someone", body: "hi", createdAt: "2025-01-01T00:00:00Z" },
      ],
    }),
  ]);
  expect(res.status).toBe("new_unreviewed");
  expect(res.summary.counts.threadsWithMyComments).toBe(0);
});

test("allgravy classify: unresolved with no reply after my comment => waiting", () => {
  const res = classifyPr("me", [
    thread({
      isResolved: false,
      comments: [
        { author: "me", body: "question", createdAt: "2025-01-01T00:00:00Z" },
      ],
    }),
  ]);
  expect(res.status).toBe("waiting");
  expect(res.summary.counts.noResponse).toBe(1);
});

test("allgravy classify: resolved thread => ready_to_approve", () => {
  const res = classifyPr("me", [
    thread({
      isResolved: true,
      comments: [
        { author: "me", body: "question", createdAt: "2025-01-01T00:00:00Z" },
      ],
    }),
  ]);
  expect(res.status).toBe("ready_to_approve");
  expect(res.summary.counts.resolved).toBe(1);
});

test("allgravy summarize: reply after my latest comment counts as addressed", () => {
  const s = summarizeMyThreads("me", [
    thread({
      isResolved: false,
      comments: [
        { author: "me", body: "first", createdAt: "2025-01-01T00:00:00Z" },
        { author: "someone", body: "reply to first", createdAt: "2025-01-01T00:00:01Z" },
        { author: "me", body: "followup", createdAt: "2025-01-01T00:00:02Z" },
        { author: "someone", body: "reply to followup", createdAt: "2025-01-01T00:00:03Z" },
      ],
    }),
  ]);
  expect(s.counts.threadsWithMyComments).toBe(1);
  expect(s.counts.noResponse).toBe(0);
  expect(s.threads[0]?.hasReplyAfterMyComment).toBe(true);
  expect(s.threads[0]?.reply?.author).toBe("someone");
});

test("allgravy queue refresh: fatal error emits queue failed event", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cb-allgravy-actions-test-"));
  const coreDbPath = path.join(tmpDir, "core.db");

  const prevDbPath = process.env["CIRCUIT_BREAKER_DB_PATH"];
  process.env["CIRCUIT_BREAKER_DB_PATH"] = coreDbPath;

  const wsMessages: any[] = [];
  try {
    mock.module("../src/allGravyGithub.js", () => ({
      OwnerRepoSchema: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
      ghLogin: () => {
        throw new Error("gh_login_boom");
      },
      listReviewRequestedPrs: () => [],
      fetchPrThreads: () => {
        throw new Error("unused");
      },
      fetchPrDetails: () => ({
        is_draft: false,
        head_sha: "deadbeef",
        comments: [],
      }),
      fetchPrFiles: () => [],
      fetchExistingComments: () => [],
      postInlineComment: () => ({ ok: false, error: "unused", command: "gh pr comment", stdout: "", stderr: "" }),
      approvePr: () => ({ ok: false, error: "unused", command: "gh pr review", stdout: "", stderr: "" }),
      classifyPr: () => ({
        status: "new_unreviewed",
        summary: { counts: { threadsWithMyComments: 0, resolved: 0, repliedNotResolved: 0, noResponse: 0 }, threads: [] },
      }),
    }));

    const { createAllGravyActionHandlers } = await import("../src/allGravyActions.js");
    const handlers = createAllGravyActionHandlers({
      stateDir: tmpDir,
      wsBroadcast: (msg) => wsMessages.push(msg),
    });

    const run = await handlers["allgravy.queue.refresh"]!.handler({});

    expect(run?.ok).toBe(false);
    expect(run?.error).toBe("queue_refresh_failed");
    expect(typeof run?.run_id).toBe("string");
    expect(run?.run_id.length).toBeGreaterThan(0);

    const failed = wsMessages.find((m) => m?.type === "allgravy.queue" && m?.event === "failed");
    expect(failed).toBeTruthy();
    expect(failed.run_id).toBe(run.run_id);
    expect(Array.isArray(failed.repos)).toBe(true);
    expect(typeof failed.error).toBe("string");
    expect(String(failed.error ?? "").length).toBeGreaterThan(0);
    expect(String(failed.error)).toContain("gh_login_boom");

    const started = wsMessages.find((m) => m?.type === "allgravy.queue" && m?.event === "started");
    expect(started).toBeUndefined();
    const completed = wsMessages.find((m) => m?.type === "allgravy.queue" && m?.event === "completed");
    expect(completed).toBeUndefined();
  } finally {
    mock.restore();

    if (prevDbPath === undefined) delete process.env["CIRCUIT_BREAKER_DB_PATH"];
    else process.env["CIRCUIT_BREAKER_DB_PATH"] = prevDbPath;

    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
