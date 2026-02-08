import type { BrainName } from "./spanishDb.js";
import { runCodex } from "./codexRunner.js";
import { runClaude } from "./claudeRunner.js";

export type BrainResult = {
  ok: boolean;
  thread_id: string | null;
  last_agent_message: string | null;
  error?: string;
  exit_code: number;
  duration_ms: number;
  stderr_tail: string;
};

export type BrainRunOpts = {
  cwd: string;
  prompt: string;
  systemPrompt?: string;
  resumeThreadId?: string | null;
  timeoutMs?: number;
  logJsonlPath?: string | null;
  jsonSchema?: object;
};

export type BrainRunner = {
  name: BrainName;
  run(opts: BrainRunOpts): Promise<BrainResult>;
};

export function createBrainRunner(name: BrainName): BrainRunner {
  if (name === "claude") {
    return {
      name: "claude",
      async run(opts) {
        return runClaude(opts);
      },
    };
  }

  return {
    name: "codex",
    async run(opts) {
      const prompt = opts.systemPrompt && !opts.resumeThreadId ? `${opts.systemPrompt}\n\n${opts.prompt}` : opts.prompt;
      const result = await runCodex({
        cwd: opts.cwd,
        prompt,
        resumeThreadId: opts.resumeThreadId ?? undefined,
        sandbox: "read-only",
        timeoutMs: opts.timeoutMs,
        logJsonlPath: opts.logJsonlPath ?? undefined,
      });
      return {
        ok: result.ok,
        thread_id: result.thread_id,
        last_agent_message: result.last_agent_message,
        error: result.ok ? undefined : (result as any).error,
        exit_code: result.exit_code,
        duration_ms: result.duration_ms,
        stderr_tail: result.stderr_tail,
      };
    },
  };
}
