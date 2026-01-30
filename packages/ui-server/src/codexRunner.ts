import fs from "node:fs";
import path from "node:path";

export type CodexSandbox = "read-only" | "workspace-write" | "danger-full-access";

export type CodexEvent = { type?: string; [k: string]: any };

export type CodexRunOpts = {
  cwd: string;
  prompt: string;
  resumeThreadId?: string | null;
  sandbox?: CodexSandbox;
  timeoutMs?: number;
  signal?: AbortSignal;
  logJsonlPath?: string | null;
  onEvent?: (evt: CodexEvent) => void;
};

export type CodexRunResult =
  | {
      ok: true;
      thread_id: string;
      last_agent_message: string | null;
      exit_code: number;
      duration_ms: number;
      events_seen: number;
      stderr_tail: string;
    }
  | {
      ok: false;
      error: string;
      thread_id: string | null;
      last_agent_message: string | null;
      exit_code: number;
      duration_ms: number;
      events_seen: number;
      stderr_tail: string;
    };

async function readLines(
  stream: ReadableStream<Uint8Array> | null | undefined,
  onLine: (line: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!stream) return;
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    if (signal?.aborted) break;
    const { done, value } = await reader.read();
    if (done) break;

    buf += decoder.decode(value, { stream: true });
    while (true) {
      const i = buf.indexOf("\n");
      if (i < 0) break;
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) onLine(line);
    }
  }

  const tail = buf.trim();
  if (tail) onLine(tail);
}

export async function runCodex(opts: CodexRunOpts): Promise<CodexRunResult> {
  const started = Date.now();
  const sandbox = opts.sandbox ?? "read-only";
  const timeoutMs = opts.timeoutMs ?? 120_000;

  const args: string[] = ["exec", "--json", "-c", "suppress_unstable_features_warning=true", "-s", sandbox];
  if (opts.resumeThreadId) {
    args.push("resume", opts.resumeThreadId, "-");
  } else {
    args.push("-");
  }

  const proc = Bun.spawn(["codex", ...args], {
    cwd: opts.cwd,
    stdin: "pipe",
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
  opts.signal?.addEventListener("abort", abort, { once: true });

  try {
    // stdin injection avoids arg length limits + quoting issues.
    proc.stdin.write(opts.prompt);
    proc.stdin.end();
  } catch {
    // ignore
  }

  let threadId: string | null = opts.resumeThreadId ?? null;
  let lastAgentMessage: string | null = null;
  let eventsSeen = 0;

  const stderrLines: string[] = [];
  const stderrKeep = 80;

  let jsonlWriter: fs.WriteStream | null = null;
  if (opts.logJsonlPath) {
    fs.mkdirSync(path.dirname(opts.logJsonlPath), { recursive: true });
    jsonlWriter = fs.createWriteStream(opts.logJsonlPath, { flags: "a" });
  }

  const stdoutTask = readLines(
    proc.stdout,
    (line) => {
      jsonlWriter?.write(line + "\n");

      if (!line.startsWith("{")) return;
      let evt: CodexEvent;
      try {
        evt = JSON.parse(line) as CodexEvent;
      } catch {
        return;
      }

      eventsSeen += 1;
      opts.onEvent?.(evt);

      if (evt.type === "thread.started" && typeof evt["thread_id"] === "string") {
        threadId = evt["thread_id"];
        return;
      }

      if (evt.type === "item.completed") {
        const item = (evt as any).item ?? null;
        if (item && item.type === "agent_message" && typeof item.text === "string") {
          lastAgentMessage = item.text;
        }
      }
    },
    opts.signal,
  );

  const stderrTask = readLines(
    proc.stderr,
    (line) => {
      stderrLines.push(line);
      while (stderrLines.length > stderrKeep) stderrLines.shift();
    },
    opts.signal,
  );

  const exitCode = await proc.exited.catch(() => -1);
  clearTimeout(timer);
  try {
    jsonlWriter?.end();
  } catch {
    // ignore
  }

  await Promise.allSettled([stdoutTask, stderrTask]);

  const durationMs = Date.now() - started;
  const stderrTail = stderrLines.join("\n").slice(-20_000);

  if (opts.signal?.aborted) {
    return {
      ok: false,
      error: "aborted",
      thread_id: threadId,
      last_agent_message: lastAgentMessage,
      exit_code: exitCode,
      duration_ms: durationMs,
      events_seen: eventsSeen,
      stderr_tail: stderrTail,
    };
  }

  if (exitCode !== 0) {
    return {
      ok: false,
      error: "codex_failed",
      thread_id: threadId,
      last_agent_message: lastAgentMessage,
      exit_code: exitCode,
      duration_ms: durationMs,
      events_seen: eventsSeen,
      stderr_tail: stderrTail,
    };
  }

  if (!threadId) {
    return {
      ok: false,
      error: "missing_thread_id",
      thread_id: null,
      last_agent_message: lastAgentMessage,
      exit_code: exitCode,
      duration_ms: durationMs,
      events_seen: eventsSeen,
      stderr_tail: stderrTail,
    };
  }

  return {
    ok: true,
    thread_id: threadId,
    last_agent_message: lastAgentMessage,
    exit_code: exitCode,
    duration_ms: durationMs,
    events_seen: eventsSeen,
    stderr_tail: stderrTail,
  };
}
