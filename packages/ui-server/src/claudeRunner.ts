import fs from "node:fs";
import path from "node:path";

import type { BrainRunOpts, BrainResult } from "./brainRunner.js";
import { SpanishBrainOutputJsonSchema } from "./spanishBrainOutput.js";

async function readStreamToString(stream: ReadableStream<Uint8Array> | null | undefined): Promise<string> {
  if (!stream) return "";
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(decoder.decode(value, { stream: true }));
  }
  return chunks.join("");
}

/**
 * Run the `claude` CLI in print mode (-p) with structured JSON output.
 *
 * New session:
 *   claude -p --output-format json --tools "" \
 *     --system-prompt "..." \
 *     --json-schema '{...}' \
 *     "CARD_PROMPT: ..."
 *
 * Resume session:
 *   claude -p --output-format json --tools "" \
 *     --resume <session_id> \
 *     --json-schema '{...}' \
 *     '{"kind":"user_answer","text":"..."}'
 */
export async function runClaude(opts: BrainRunOpts): Promise<BrainResult> {
  const started = Date.now();
  const timeoutMs = opts.timeoutMs ?? 120_000;

  const args: string[] = [
    "-p",
    "--output-format", "json",
    "--tools", "",
  ];

  if (opts.systemPrompt && !opts.resumeThreadId) {
    args.push("--system-prompt", opts.systemPrompt);
  }

  if (opts.resumeThreadId) {
    args.push("--resume", opts.resumeThreadId);
  }

  const schema = opts.jsonSchema ?? SpanishBrainOutputJsonSchema;
  args.push("--json-schema", JSON.stringify(schema));

  // Prompt goes last as a positional argument.
  args.push(opts.prompt);

  if (opts.logJsonlPath) {
    fs.mkdirSync(path.dirname(opts.logJsonlPath), { recursive: true });
  }

  const proc = Bun.spawn(["claude", ...args], {
    cwd: opts.cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  const abort = () => {
    try {
      proc.kill();
    } catch {
      // ignore
    }
  };

  const timer = setTimeout(abort, timeoutMs);

  // Read stdout/stderr concurrently to avoid buffer-related deadlocks.
  const stdoutTask = readStreamToString(proc.stdout);
  const stderrTask = readStreamToString(proc.stderr);
  const exitCode = await proc.exited.catch(() => -1);
  clearTimeout(timer);

  const durationMs = Date.now() - started;
  const [stdout, stderr] = await Promise.all([stdoutTask, stderrTask]);
  const stderrTail = stderr.slice(-20_000);

  if (opts.logJsonlPath) {
    try {
      fs.writeFileSync(opts.logJsonlPath, stdout);
    } catch {
      // ignore
    }
  }

  if (exitCode !== 0) {
    return {
      ok: false,
      thread_id: null,
      last_agent_message: null,
      error: "claude_failed",
      exit_code: exitCode,
      duration_ms: durationMs,
      stderr_tail: stderrTail,
    };
  }

  // Parse the top-level Claude CLI JSON output.
  let cliOutput: any;
  try {
    cliOutput = JSON.parse(stdout);
  } catch {
    return {
      ok: false,
      thread_id: null,
      last_agent_message: stdout.slice(0, 4000),
      error: "bad_cli_json",
      exit_code: exitCode,
      duration_ms: durationMs,
      stderr_tail: stderrTail,
    };
  }

  // Claude can sometimes return exit code 0 but still flag an error in JSON.
  // Prefer these flags over treating the response as successful.
  if (cliOutput?.is_error) {
    return {
      ok: false,
      thread_id: typeof cliOutput.session_id === "string" ? cliOutput.session_id : null,
      last_agent_message: typeof stdout === "string" ? stdout.slice(0, 4000) : null,
      error: "claude_is_error",
      exit_code: exitCode,
      duration_ms: durationMs,
      stderr_tail: stderrTail,
    };
  }

  // Claude CLI print mode with --output-format json returns:
  // { session_id, structured_output, result, ... }
  const sessionId: string | null = typeof cliOutput.session_id === "string" ? cliOutput.session_id : null;

  // Prefer structured output when present (this is where --json-schema puts the object).
  let lastAgentMessage: string | null = null;
  if (cliOutput.structured_output && typeof cliOutput.structured_output === "object") {
    lastAgentMessage = JSON.stringify(cliOutput.structured_output);
  } else if (typeof cliOutput.result === "string") {
    lastAgentMessage = cliOutput.result;
  } else if (cliOutput.result && typeof cliOutput.result === "object") {
    lastAgentMessage = JSON.stringify(cliOutput.result);
  }

  if (!sessionId) {
    return {
      ok: false,
      thread_id: null,
      last_agent_message: lastAgentMessage,
      error: "missing_session_id",
      exit_code: exitCode,
      duration_ms: durationMs,
      stderr_tail: stderrTail,
    };
  }

  if (!lastAgentMessage || !lastAgentMessage.trim()) {
    return {
      ok: false,
      thread_id: sessionId,
      last_agent_message: stdout.slice(0, 4000),
      error: "missing_brain_output",
      exit_code: exitCode,
      duration_ms: durationMs,
      stderr_tail: stderrTail,
    };
  }

  return {
    ok: true,
    thread_id: sessionId,
    last_agent_message: lastAgentMessage,
    exit_code: exitCode,
    duration_ms: durationMs,
    stderr_tail: stderrTail,
  };
}
