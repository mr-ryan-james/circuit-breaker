import { expect, test } from "bun:test";

import { computeListenScore, levenshteinTokens } from "../src/listenServer.js";

test("computeListenScore allows 1 edit for short words", () => {
  const score = computeListenScore({ edits: 1, refLen: 4, durationRatio: 1.74 });

  expect(score.max_edits).toBe(1);
  expect(score.pass).toBe(true);
  expect(score.duration_ratio).toBe(1.74);
});

test("computeListenScore fails above max edits or duration bound", () => {
  const tooManyEdits = computeListenScore({ edits: 2, refLen: 4, durationRatio: 1.0 });
  expect(tooManyEdits.max_edits).toBe(1);
  expect(tooManyEdits.pass).toBe(false);

  const tooLong = computeListenScore({ edits: 1, refLen: 5, durationRatio: 1.76 });
  expect(tooLong.max_edits).toBe(1);
  expect(tooLong.pass).toBe(false);
});

test("levenshteinTokens returns ordered structured edit ops", () => {
  const result = levenshteinTokens(["k", "r", "a"], ["k", "l", "a", "s"]);

  expect(result.edits).toBe(2);
  expect(result.ops).toEqual([
    { op: "match", ref_phone: "k", attempt_phone: "k", ref_idx: 0, attempt_idx: 0 },
    { op: "substitution", ref_phone: "r", attempt_phone: "l", ref_idx: 1, attempt_idx: 1 },
    { op: "match", ref_phone: "a", attempt_phone: "a", ref_idx: 2, attempt_idx: 2 },
    { op: "insertion", attempt_phone: "s", attempt_idx: 3 },
  ]);
});
