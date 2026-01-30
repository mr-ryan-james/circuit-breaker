import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sanitizeTtsText, TTS_SANITIZER_VERSION } from "./sanitize.js";
import { getAudioDurationSeconds, renderTts } from "./tts.js";

const DEFAULT_PHONEME_MODEL = "facebook/wav2vec2-xlsr-53-espeak-cv-ft";

type PhoneTool = {
  name: string;
  model: string;
  device: string;
  torch?: string;
  transformers?: string;
};

export type ListenScore = {
  edits: number;
  ref_len: number;
  per: number;
  duration_ratio: number;
  pass: boolean;
};

export type ListenAnalysis = {
  ok: true;
  ref: { audio_id: string; wav_path: string; phones: string[]; tool: PhoneTool; cached: boolean; duration_sec: number };
  attempt: { wav_path: string; phones: string[]; tool: PhoneTool; duration_sec: number };
  score: ListenScore;
};

function fileExistsNonEmpty(filePath: string): boolean {
  try {
    const st = fs.statSync(filePath);
    return st.isFile() && st.size > 0;
  } catch {
    return false;
  }
}

function repoRootFromHere(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../../");
}

function pythonExecPath(): string {
  const override = (process.env["CIRCUIT_BREAKER_PYTHON"] ?? "").trim();
  if (override) {
    const resolved = path.resolve(override);
    if (!fileExistsNonEmpty(resolved)) throw new Error(`CIRCUIT_BREAKER_PYTHON not found: ${resolved}`);
    return resolved;
  }

  const repoRoot = repoRootFromHere();
  const candidates = [path.join(repoRoot, ".venv", "bin", "python3"), path.join(repoRoot, ".venv", "bin", "python")];
  for (const c of candidates) {
    if (fileExistsNonEmpty(c)) return c;
  }

  throw new Error(
    "Python venv not found. Create with: python3 -m venv .venv && .venv/bin/python -m pip install torch transformers numpy",
  );
}

function phonemizeScriptPath(): string {
  return path.join(repoRootFromHere(), "packages", "cli", "scripts", "phonemize.py");
}

function soxConvertTo16kMonoWav(inputPath: string, outputPath: string): void {
  const proc = Bun.spawnSync(
    ["sox", inputPath, "-r", "16000", "-c", "1", "-b", "16", "-e", "signed-integer", outputPath],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (proc.exitCode !== 0) {
    const stderr = new TextDecoder().decode(proc.stderr ?? new Uint8Array()).trim();
    throw new Error(`sox conversion failed: ${stderr}`);
  }
  if (!fileExistsNonEmpty(outputPath)) throw new Error("sox conversion produced empty wav");
}

function levenshteinTokens(a: string[], b: string[]): { edits: number } {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const get = (i: number, j: number): number => dp[i]![j]!;
  const set = (i: number, j: number, v: number): void => {
    dp[i]![j] = v;
  };

  for (let i = 0; i <= n; i += 1) set(i, 0, i);
  for (let j = 0; j <= m; j += 1) set(0, j, j);

  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      set(i, j, Math.min(get(i - 1, j) + 1, get(i, j - 1) + 1, get(i - 1, j - 1) + cost));
    }
  }

  return { edits: get(n, m) };
}

function extractPhonesWav2Vec2(wavPath: string, pythonPath: string): { phones: string[]; tool: PhoneTool } {
  const scriptPath = phonemizeScriptPath();
  if (!fileExistsNonEmpty(scriptPath)) {
    throw new Error(`Phonemizer script not found: ${scriptPath}`);
  }

  const env = { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: "0" };
  const proc = Bun.spawnSync(
    [pythonPath, "--", scriptPath, "--wav", wavPath, "--model", DEFAULT_PHONEME_MODEL],
    { cwd: repoRootFromHere(), env, stdout: "pipe", stderr: "pipe" },
  );
  const stdout = new TextDecoder().decode(proc.stdout ?? new Uint8Array()).trim();
  const stderr = new TextDecoder().decode(proc.stderr ?? new Uint8Array()).trim();
  if (proc.exitCode !== 0) {
    const detail = [stderr, stdout].filter(Boolean).join("\n").trim();
    throw new Error(`Phoneme extraction failed (wav2vec2): ${detail || `exit_code=${proc.exitCode}`}`);
  }

  let parsed: any = null;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`Phoneme extraction returned non-JSON output:\n${stdout.slice(0, 500)}`);
  }

  if (!parsed || parsed.ok !== true) throw new Error(`Phoneme extraction failed: ${parsed?.error || stdout.slice(0, 500)}`);
  if (!Array.isArray(parsed.phones) || parsed.phones.length === 0) throw new Error("Phoneme extraction returned empty phones");

  return {
    phones: parsed.phones as string[],
    tool: (parsed.tool ?? { name: "wav2vec2", model: DEFAULT_PHONEME_MODEL, device: "mps" }) as PhoneTool,
  };
}

function normalizeListenText(raw: string): string {
  const s = sanitizeTtsText(raw).trim();
  if (!s) return "";
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

export async function analyzeListenAttempt(params: {
  stateDir: string;
  target_text: string;
  attempt_wav_path: string;
  voice?: string;
  rate?: string;
}): Promise<ListenAnalysis> {
  const voice = params.voice ?? "es-ES-AlvaroNeural";
  const rate = params.rate ?? "-25%";
  const targetText = normalizeListenText(params.target_text);
  if (!targetText) throw new Error("listen: empty target_text");

  const listenDir = path.join(params.stateDir, "spanish", "listen");
  const refDir = path.join(listenDir, "refs");
  const attemptDir = path.join(listenDir, "attempts");
  fs.mkdirSync(refDir, { recursive: true });
  fs.mkdirSync(attemptDir, { recursive: true });

  // 1) Render reference mp3 (cached).
  const refTts = await renderTts({
    text: targetText,
    voice,
    rate,
    sanitizerVersion: TTS_SANITIZER_VERSION,
  });

  const refWav = path.join(refDir, `${refTts.audio_id}.wav`);
  const refPhonesPath = path.join(refDir, `${refTts.audio_id}.phones.json`);

  if (!fileExistsNonEmpty(refWav)) {
    // Convert cached mp3 -> 16k mono wav for phonemizer.
    soxConvertTo16kMonoWav(refTts.mp3_path, refWav);
  }

  const pythonPath = pythonExecPath();
  let refPhones: string[] | null = null;
  let refTool: PhoneTool | null = null;

  if (fileExistsNonEmpty(refPhonesPath)) {
    try {
      const raw = fs.readFileSync(refPhonesPath, "utf8");
      const parsed = JSON.parse(raw) as any;
      if (Array.isArray(parsed?.phones) && parsed.phones.length > 0) refPhones = parsed.phones;
      if (parsed?.tool) refTool = parsed.tool;
    } catch {
      // ignore cache corruption
    }
  }

  if (!refPhones || !refTool) {
    const res = extractPhonesWav2Vec2(refWav, pythonPath);
    refPhones = res.phones;
    refTool = res.tool;
    try {
      fs.writeFileSync(refPhonesPath, JSON.stringify({ created_at: new Date().toISOString(), phones: refPhones, tool: refTool }, null, 2));
    } catch {
      // ignore cache write failure
    }
  }

  // 2) Ensure attempt is 16k mono wav in our own dir.
  const attemptBase = path.basename(params.attempt_wav_path).replace(/[^A-Za-z0-9_.-]+/g, "_");
  const attemptWav = path.join(attemptDir, `attempt-${Date.now()}-${attemptBase}`.replace(/\.wav$/i, "") + ".wav");
  soxConvertTo16kMonoWav(params.attempt_wav_path, attemptWav);

  const attemptRes = extractPhonesWav2Vec2(attemptWav, pythonPath);

  // 3) Score.
  const { edits } = levenshteinTokens(refPhones, attemptRes.phones);
  const per = refPhones.length > 0 ? edits / refPhones.length : 1;
  const refDur = getAudioDurationSeconds(refWav);
  const attemptDur = getAudioDurationSeconds(attemptWav);
  const durationRatio = refDur > 0 ? attemptDur / refDur : 0;
  const pass = per <= 0.15 && durationRatio >= 0.75 && durationRatio <= 1.35;

  return {
    ok: true,
    ref: {
      audio_id: refTts.audio_id,
      wav_path: refWav,
      phones: refPhones,
      tool: refTool,
      cached: refTts.cached,
      duration_sec: refDur,
    },
    attempt: {
      wav_path: attemptWav,
      phones: attemptRes.phones,
      tool: attemptRes.tool,
      duration_sec: attemptDur,
    },
    score: {
      edits,
      ref_len: refPhones.length,
      per: Number(per.toFixed(3)),
      duration_ratio: Number(durationRatio.toFixed(3)),
      pass,
    },
  };
}
