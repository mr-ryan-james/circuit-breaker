import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { resolveDbPath } from "@circuit-breaker/core";

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

// In-memory duration cache to avoid shelling out to sox repeatedly for the same cached file.
// MP3s are content-addressed and immutable, so caching is safe for the server lifetime.
const durationSecCache = new Map<string, number>();

export function normalizeTtsText(input: string): string {
  return input.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function computeEdgeTtsTimeoutMs(text: string): number {
  const normalized = normalizeTtsText(text);
  return clamp(15_000, 180_000, 10_000 + normalized.length * 35);
}

export function resolveTtsCacheDir(): string {
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  const baseDir = path.dirname(resolveDbPath());
  return uid === null ? path.join(baseDir, "tts-cache") : path.join(baseDir, `tts-cache-${uid}`);
}

function fileExistsNonEmpty(filePath: string): boolean {
  try {
    const st = fs.statSync(filePath);
    return st.isFile() && st.size > 0;
  } catch {
    return false;
  }
}

export function getAudioDurationSeconds(audioPath: string): number {
  const cached = durationSecCache.get(audioPath);
  if (cached !== undefined) return cached;

  const proc = Bun.spawnSync(["sox", "--i", "-D", audioPath], { stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) {
    throw new Error(`sox failed: ${new TextDecoder().decode(proc.stderr)}`);
  }
  const out = new TextDecoder().decode(proc.stdout).trim();
  const seconds = Number(out);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`Invalid sox duration output: ${JSON.stringify(out)}`);
  durationSecCache.set(audioPath, seconds);
  return seconds;
}

export async function renderTts(params: {
  text: string;
  voice: string;
  rate: string;
  sanitizerVersion?: string;
  refresh?: boolean;
  timeoutMs?: number;
}): Promise<{ audio_id: string; mp3_path: string; duration_sec: number; cached: boolean }> {
  const voice = params.voice;
  const rate = params.rate;
  const refresh = params.refresh ?? false;
  const sanitizerVersion = params.sanitizerVersion ?? "sanitize_v0";

  const text = normalizeTtsText(params.text);
  if (!text) throw new Error("renderTts: empty text");

  const cacheDir = resolveTtsCacheDir();
  fs.mkdirSync(cacheDir, { recursive: true });

  const audioId = crypto
    .createHash("sha256")
    .update(`v1|edge-tts|${sanitizerVersion}|${voice}|${rate}|${text}`, "utf8")
    .digest("hex")
    .slice(0, 24);

  const mp3Path = path.join(cacheDir, `${audioId}.mp3`);
  let cached = false;

  if (!refresh && fileExistsNonEmpty(mp3Path)) {
    cached = true;
  } else {
    const tmpMp3 = path.join(cacheDir, `${audioId}.tmp-${process.pid}-${Date.now()}.mp3`);
    try {
      fs.rmSync(tmpMp3, { force: true });
    } catch {
      // ignore
    }

    const timeoutMs = params.timeoutMs ?? computeEdgeTtsTimeoutMs(text);

    const child = Bun.spawn(["edge-tts", "--voice", voice, "--text", text, `--rate=${rate}`, "--write-media", tmpMp3], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
    }, timeoutMs);

    const exitCode = await child.exited;
    clearTimeout(timer);

    if (exitCode !== 0 || !fileExistsNonEmpty(tmpMp3)) {
      const stderr = new TextDecoder().decode(await new Response(child.stderr).arrayBuffer());
      try {
        fs.rmSync(tmpMp3, { force: true });
      } catch {
        // ignore
      }
      throw new Error(`edge-tts failed (code=${exitCode}): ${stderr.trim()}`);
    }

    fs.renameSync(tmpMp3, mp3Path);
  }

  const duration = getAudioDurationSeconds(mp3Path);

  return { audio_id: audioId, mp3_path: mp3Path, duration_sec: duration, cached };
}
