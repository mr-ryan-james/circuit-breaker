import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { TIMER_DIR_PATH } from "./paths.js";

function ensureTimerDir(): void {
  fs.mkdirSync(TIMER_DIR_PATH, { recursive: true });
}

function pidFilePath(siteSlug: string): string {
  return path.join(TIMER_DIR_PATH, `${siteSlug}.pid`);
}

function readPid(siteSlug: string): number | null {
  const file = pidFilePath(siteSlug);
  try {
    const raw = fs.readFileSync(file, "utf8").trim();
    const pid = Number(raw);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // If the process exists but we don't have permission to signal it (e.g. root-owned timer),
    // treat it as running.
    if (err && typeof err === "object" && "code" in err) {
      const code = (err as { code?: unknown }).code;
      if (code === "EPERM") return true;
    }
    return false;
  }
}

export function getTimerStatus(siteSlug: string): { pid: number | null; running: boolean } {
  const pid = readPid(siteSlug);
  if (!pid) return { pid: null, running: false };
  return { pid, running: isPidRunning(pid) };
}

export function killTimer(siteSlug: string): { killed: boolean; pid: number | null } {
  ensureTimerDir();
  const pid = readPid(siteSlug);
  const file = pidFilePath(siteSlug);

  if (!pid) {
    try {
      fs.rmSync(file, { force: true });
    } catch {
      // ignore
    }
    return { killed: false, pid: null };
  }

  let killed = false;
  try {
    process.kill(pid);
    killed = true;
  } catch {
    killed = false;
  }

  try {
    fs.rmSync(file, { force: true });
  } catch {
    // ignore
  }

  return { killed, pid };
}

export interface StartTimerOptions {
  siteSlug: string;
  minutes: number;
  execPath: string;
  args: string[];
  env?: Record<string, string | undefined>;
}

export function startTimer(options: StartTimerOptions): { pid: number } {
  ensureTimerDir();
  killTimer(options.siteSlug);

  const child = spawn(options.execPath, options.args, {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, ...options.env },
  });
  child.unref();

  const pid = child.pid;
  if (!pid) throw new Error("Failed to start timer process");
  fs.writeFileSync(pidFilePath(options.siteSlug), String(pid), "utf8");
  return { pid };
}
