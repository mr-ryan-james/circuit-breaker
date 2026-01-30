import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

import { resolveDbPath } from "@circuit-breaker/core";

function fileExistsNonEmpty(filePath: string): boolean {
  try {
    const st = fs.statSync(filePath);
    return st.isFile() && st.size > 0;
  } catch {
    return false;
  }
}

function commandExists(cmd: string): boolean {
  try {
    execFileSync("command", ["-v", cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function requireCommand(cmd: string, hint: string): void {
  if (commandExists(cmd)) return;
  throw new Error(`${cmd} not found. ${hint}`);
}

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeTtsText(input: string): string {
  return input.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function computeEdgeTtsTimeoutMs(text: string): number {
  const normalized = normalizeTtsText(text);
  // Long monologues can take a while; keep this conservative but bounded.
  return clamp(15_000, 180_000, 10_000 + normalized.length * 35);
}

export function resolveTtsCacheDir(): string {
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  const baseDir = path.dirname(resolveDbPath());
  return uid === null ? path.join(baseDir, "tts-cache") : path.join(baseDir, `tts-cache-${uid}`);
}

export function getAudioDurationSeconds(audioPath: string): number {
  requireCommand("sox", "Install with: brew install sox");
  const out = execFileSync("sox", ["--i", "-D", audioPath], { encoding: "utf8" }).trim();
  const seconds = Number(out);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`Unable to parse sox duration for ${audioPath}: ${JSON.stringify(out)}`);
  }
  return seconds;
}

export function renderTts(params: {
  text: string;
  voice: string;
  rate: string;
  refresh?: boolean;
  timeoutMs?: number;
  cacheDir?: string;
}): { mp3Path: string; cached: boolean } {
  requireCommand("edge-tts", "Install with: pipx install edge-tts");

  const voice = params.voice;
  const rate = params.rate;
  const refresh = params.refresh ?? false;

  const text = normalizeTtsText(params.text);
  if (!text) throw new Error("renderTts: empty text");

  const cacheDir = params.cacheDir ? path.resolve(params.cacheDir) : resolveTtsCacheDir();
  fs.mkdirSync(cacheDir, { recursive: true });

  const hash = crypto
    .createHash("sha256")
    .update(`v1|edge-tts|${voice}|${rate}|${text}`, "utf8")
    .digest("hex")
    .slice(0, 24);

  const mp3Path = path.join(cacheDir, `${hash}.mp3`);
  let cached = false;

  if (!refresh && fileExistsNonEmpty(mp3Path)) {
    cached = true;
  } else {
    const tmpMp3 = path.join(cacheDir, `${hash}.tmp-${process.pid}-${Date.now()}.mp3`);
    try {
      fs.rmSync(tmpMp3, { force: true });
    } catch {
      // ignore
    }

    const timeoutMs = params.timeoutMs ?? computeEdgeTtsTimeoutMs(text);
    try {
      execFileSync(
        "edge-tts",
        ["--voice", voice, "--text", text, "--rate", rate, "--write-media", tmpMp3],
        { stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs },
      );
      if (!fileExistsNonEmpty(tmpMp3)) {
        throw new Error("edge-tts produced an empty audio file");
      }
      fs.renameSync(tmpMp3, mp3Path);
    } catch (e: unknown) {
      try {
        fs.rmSync(tmpMp3, { force: true });
      } catch {
        // ignore
      }

      const err = e as { code?: string; killed?: boolean; message?: string };
      const errMsg =
        err.code === "ETIMEDOUT" || err.killed
          ? `edge-tts timed out after ${timeoutMs}ms (are you offline?)`
          : err.code === "ENOENT"
            ? "edge-tts not found. Install with: pipx install edge-tts"
            : `edge-tts failed: ${err.message || e}`;

      throw new Error(errMsg);
    }
  }

  return { mp3Path, cached };
}
