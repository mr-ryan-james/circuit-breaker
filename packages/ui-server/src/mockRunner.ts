import type { BrainResult, BrainRunOpts } from "./brainRunner.js";

const MOCK_LINE_PREFIX = "MOCK_BRAIN_OUTPUT_JSON:";

function tryParseJson(raw: string): any | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractMockBrainOutputFromPrompt(prompt: string): any | null {
  const lines = String(prompt ?? "").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(MOCK_LINE_PREFIX)) continue;
    const jsonText = trimmed.slice(MOCK_LINE_PREFIX.length).trim();
    if (!jsonText) return null;
    const parsed = tryParseJson(jsonText);
    if (parsed && typeof parsed === "object") return parsed;
    return null;
  }
  return null;
}

function defaultMockBrainOutput(): any {
  return {
    v: 1,
    assistant_text: "mock",
    tool_requests: [],
    await: "done",
    score: { correct: 1, total: 1 },
  };
}

export async function runMock(opts: BrainRunOpts): Promise<BrainResult> {
  const started = Date.now();

  const fromPrompt = extractMockBrainOutputFromPrompt(opts.prompt);
  const fromEnv = (() => {
    const raw = process.env["CIRCUIT_BREAKER_MOCK_BRAIN_OUTPUT_JSON"]?.trim();
    if (!raw) return null;
    const parsed = tryParseJson(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  })();

  const output = fromPrompt ?? fromEnv ?? defaultMockBrainOutput();

  const threadId = opts.resumeThreadId && opts.resumeThreadId.trim().length > 0 ? opts.resumeThreadId.trim() : "mock_thread_1";
  const durationMs = Date.now() - started;

  return {
    ok: true,
    thread_id: threadId,
    last_agent_message: JSON.stringify(output),
    exit_code: 0,
    duration_ms: durationMs,
    stderr_tail: "",
  };
}

