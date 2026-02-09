import { execFileSync } from "node:child_process";

import { renderTts } from "../tts/edgeTts.js";
import { sanitizeTtsText, TTS_SANITIZER_VERSION } from "./sanitize.js";
import { normalizeMeName } from "./names.js";
import type { ScriptLineType } from "./types.js";

export type RunLinesMode = "practice" | "learn" | "boss";

export type ScriptLineRow = {
  idx: number;
  type: ScriptLineType;
  speaker_normalized: string | null;
  text: string;
  scene_number: number | null;
  scene_heading: string | null;
};

export type ScriptCharacterRow = {
  normalized_name: string;
  name: string;
  voice: string;
  rate: string;
};

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function estimatedSpeakSeconds(text: string): number {
  // Rough: 150 wpm => 2.5 words/sec; add a small constant.
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return clamp(0.8, 12, 0.4 + words / 2.5);
}

function playMp3Blocking(mp3Path: string): void {
  execFileSync("afplay", [mp3Path], { stdio: "ignore" });
}

function cuePrefixWords(text: string, n: number): string {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const slice = parts.slice(0, Math.max(0, n));
  return slice.join(" ");
}

export async function runLinesSession(params: {
  mode: RunLinesMode;
  me: string;
  readAll: boolean;
  lines: ScriptLineRow[];
  characters: ScriptCharacterRow[];
  voiceFallback: { voice: string; rate: string };
  fromIdx: number;
  toIdx: number;
  loop: number | "forever";
  pauseMult: number;
  pauseMinSec: number;
  pauseMaxSec: number;
  cueWords: number;
  revealAfter: boolean;
  printDirections: boolean;
}): Promise<{ loops_completed: number; last_idx: number }> {
  const meNorm = normalizeMeName(params.me);
  const mode: RunLinesMode = params.mode;
  const speedMult = mode === "boss" ? 1.25 : 1.0;

  const charByNorm = new Map<string, ScriptCharacterRow>();
  for (const c of params.characters) charByNorm.set(c.normalized_name, c);

  const loopsTarget = params.loop === "forever" ? Infinity : Math.max(1, params.loop);

  let lastIdx = params.fromIdx;
  let loopsCompleted = 0;

  const linesInRange = params.lines.filter((l) => l.idx >= params.fromIdx && l.idx <= params.toIdx);
  if (linesInRange.length === 0) {
    throw new Error(`No lines in range ${params.fromIdx}..${params.toIdx}`);
  }

  while (loopsCompleted < loopsTarget) {
    for (const l of linesInRange) {
      lastIdx = l.idx;

      if (l.type !== "dialogue") {
        if (params.printDirections) {
          const label = l.type === "scene" ? "SCENE" : l.type === "action" ? "DIR" : "PAREN";
          // Never speak; print only.
          process.stdout.write(`[${label}] ${l.text}\n`);
        }
        continue;
      }

      const speaker = (l.speaker_normalized ?? "").trim();
      const text = sanitizeTtsText(l.text);
      if (!text) continue;

      if (!params.readAll && speaker && speaker === meNorm) {
        if (params.cueWords > 0) {
          const cue = cuePrefixWords(text, params.cueWords);
          if (cue) process.stdout.write(`[YOU] ${cue} …\n`);
        }

        // Pause timing:
        // - In learn mode w/ revealAfter, we can use real TTS duration because we will render anyway.
        // - Otherwise use a word-count estimate to avoid forcing network TTS for your lines.
        const baseSeconds = estimatedSpeakSeconds(text);
        let revealMp3: string | null = null;
        if (mode === "learn" && params.revealAfter) {
          const meChar = charByNorm.get(meNorm);
          const voice = meChar?.voice || params.voiceFallback.voice;
          const rate = meChar?.rate || params.voiceFallback.rate;
          const res = renderTts({ text, voice, rate, sanitizerVersion: TTS_SANITIZER_VERSION });
          revealMp3 = res.mp3Path;
        }

        const pauseSec = clamp(params.pauseMinSec, params.pauseMaxSec, (baseSeconds * params.pauseMult) / speedMult);
        await sleepMs(Math.round(pauseSec * 1000));

        if (mode === "learn" && params.revealAfter && revealMp3) {
          playMp3Blocking(revealMp3);
        }
        continue;
      }

      // Other characters: speak the dialogue (no speaker prefix).
      const ch = speaker ? charByNorm.get(speaker) : null;
      const voice = ch?.voice || params.voiceFallback.voice;
      const rate = ch?.rate || params.voiceFallback.rate;
      const res = renderTts({ text, voice, rate, sanitizerVersion: TTS_SANITIZER_VERSION });
      playMp3Blocking(res.mp3Path);
    }

    loopsCompleted += 1;
    if (loopsTarget !== Infinity && loopsCompleted >= loopsTarget) break;
  }

  return { loops_completed: loopsCompleted, last_idx: lastIdx };
}
