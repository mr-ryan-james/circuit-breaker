import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sanitizeTtsText, TTS_SANITIZER_VERSION } from "./sanitize.js";
import { getAudioDurationSeconds, renderTts } from "./tts.js";

const DEFAULT_PHONEME_MODEL = "facebook/wav2vec2-xlsr-53-espeak-cv-ft";
const DEFAULT_PHONEMIZE_DAEMON_URL = "http://127.0.0.1:18923";
const DEFAULT_DAEMON_TIMEOUT_MS = 6_000;

type PhoneTool = {
  name: string;
  model: string;
  device: string;
  torch?: string;
  transformers?: string;
};

export type PhoneEdit = {
  op: "match" | "substitution" | "insertion" | "deletion";
  ref_phone?: string;
  attempt_phone?: string;
  ref_idx?: number;
  attempt_idx?: number;
};

export type ListenScore = {
  edits: number;
  ref_len: number;
  max_edits: number;
  per: number;
  duration_ratio: number;
  pass: boolean;
};

export type ListenAnalysis = {
  ok: true;
  ref: { audio_id: string; wav_path: string; phones: string[]; tool: PhoneTool; cached: boolean; duration_sec: number };
  attempt: { wav_path: string; phones: string[]; tool: PhoneTool; duration_sec: number };
  score: ListenScore;
  edits_detail: PhoneEdit[];
  meta: {
    ref_extractor: "daemon" | "spawn";
    attempt_extractor: "daemon" | "spawn";
    daemon_error?: string;
  };
};

type CommandResult = {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  error?: string;
};

type ExtractPhonesResult = {
  phones: string[];
  tool: PhoneTool;
  source: "daemon" | "spawn";
  daemon_error?: string;
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

function phonemizeDaemonUrl(): string {
  return (process.env["CIRCUIT_BREAKER_PHONEMIZE_DAEMON_URL"] ?? DEFAULT_PHONEMIZE_DAEMON_URL).trim().replace(/\/+$/, "");
}

function daemonTimeoutMs(): number {
  const raw = Number(process.env["CIRCUIT_BREAKER_PHONEMIZE_DAEMON_TIMEOUT_MS"] ?? DEFAULT_DAEMON_TIMEOUT_MS);
  return Number.isFinite(raw) && raw >= 250 ? raw : DEFAULT_DAEMON_TIMEOUT_MS;
}

async function runCommand(cmd: string, args: string[], opts?: { cwd?: string; env?: Record<string, string | undefined> }): Promise<CommandResult> {
  try {
    const proc = Bun.spawn([cmd, ...args], {
      cwd: opts?.cwd,
      env: opts?.env,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text().catch(() => ""),
      new Response(proc.stderr).text().catch(() => ""),
      proc.exited,
    ]);

    return {
      ok: exitCode === 0,
      exitCode,
      stdout: String(stdout ?? ""),
      stderr: String(stderr ?? ""),
    };
  } catch (e: unknown) {
    return {
      ok: false,
      exitCode: -1,
      stdout: "",
      stderr: "",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function soxConvertTo16kMonoWav(inputPath: string, outputPath: string): Promise<{ converter: "sox" | "ffmpeg" }> {
  const sox = await runCommand("sox", [inputPath, "-r", "16000", "-c", "1", "-b", "16", "-e", "signed-integer", outputPath]);
  if (sox.ok && fileExistsNonEmpty(outputPath)) {
    return { converter: "sox" };
  }

  try {
    fs.rmSync(outputPath, { force: true });
  } catch {
    // ignore
  }

  const ffmpeg = await runCommand("ffmpeg", ["-y", "-i", inputPath, "-ar", "16000", "-ac", "1", "-sample_fmt", "s16", outputPath]);
  if (ffmpeg.ok && fileExistsNonEmpty(outputPath)) {
    return { converter: "ffmpeg" };
  }

  const messages = [
    `sox: ${sox.error ?? sox.stderr ?? `exit_code=${sox.exitCode}`}`,
    `ffmpeg: ${ffmpeg.error ?? ffmpeg.stderr ?? `exit_code=${ffmpeg.exitCode}`}`,
  ];
  throw new Error(`audio conversion failed:\n${messages.join("\n")}`);
}

export function levenshteinTokens(a: string[], b: string[]): { edits: number; ops: PhoneEdit[] } {
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

  const opsRev: PhoneEdit[] = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    const current = get(i, j);

    if (i > 0 && j > 0) {
      const refPhone = a[i - 1];
      const attemptPhone = b[j - 1];
      const cost = refPhone === attemptPhone ? 0 : 1;
      if (current === get(i - 1, j - 1) + cost) {
        opsRev.push(
          cost === 0
            ? {
                op: "match",
                ref_phone: refPhone,
                attempt_phone: attemptPhone,
                ref_idx: i - 1,
                attempt_idx: j - 1,
              }
            : {
                op: "substitution",
                ref_phone: refPhone,
                attempt_phone: attemptPhone,
                ref_idx: i - 1,
                attempt_idx: j - 1,
              },
        );
        i -= 1;
        j -= 1;
        continue;
      }
    }

    if (i > 0 && current === get(i - 1, j) + 1) {
      opsRev.push({ op: "deletion", ref_phone: a[i - 1], ref_idx: i - 1 });
      i -= 1;
      continue;
    }

    if (j > 0 && current === get(i, j - 1) + 1) {
      opsRev.push({ op: "insertion", attempt_phone: b[j - 1], attempt_idx: j - 1 });
      j -= 1;
      continue;
    }

    // Defensive fallback for any DP tie-break corner case.
    if (i > 0 && j > 0) {
      opsRev.push({
        op: a[i - 1] === b[j - 1] ? "match" : "substitution",
        ref_phone: a[i - 1],
        attempt_phone: b[j - 1],
        ref_idx: i - 1,
        attempt_idx: j - 1,
      });
      i -= 1;
      j -= 1;
      continue;
    }
    if (i > 0) {
      opsRev.push({ op: "deletion", ref_phone: a[i - 1], ref_idx: i - 1 });
      i -= 1;
      continue;
    }
    if (j > 0) {
      opsRev.push({ op: "insertion", attempt_phone: b[j - 1], attempt_idx: j - 1 });
      j -= 1;
      continue;
    }
  }

  opsRev.reverse();
  return { edits: get(n, m), ops: opsRev };
}

export function computeListenScore(args: { edits: number; refLen: number; durationRatio: number }): ListenScore {
  const refLen = Math.trunc(Number(args.refLen));
  if (!Number.isFinite(refLen) || refLen <= 0) {
    throw new Error("Invalid reference phone length: must be > 0");
  }

  const edits = Math.max(0, Math.trunc(Number(args.edits)));
  const durationRatio = Number(args.durationRatio);
  const maxEdits = Math.max(1, Math.floor(refLen * 0.2));
  const per = edits / refLen;
  const pass = edits <= maxEdits && durationRatio >= 0.75 && durationRatio <= 1.75;

  return {
    edits,
    ref_len: refLen,
    max_edits: maxEdits,
    per: Number(per.toFixed(3)),
    duration_ratio: Number(durationRatio.toFixed(3)),
    pass,
  };
}

async function extractPhonesViaDaemon(wavPath: string): Promise<{ phones: string[]; tool: PhoneTool }> {
  const body = fs.readFileSync(wavPath);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), daemonTimeoutMs());

  try {
    const resp = await fetch(`${phonemizeDaemonUrl()}/phonemize`, {
      method: "POST",
      headers: {
        "content-type": "audio/wav",
      },
      body,
      signal: controller.signal,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`status=${resp.status} body=${text.slice(0, 300)}`);
    }

    const parsed = await resp.json().catch(() => null) as any;
    if (!parsed || parsed.ok !== true) {
      throw new Error(`invalid daemon response: ${JSON.stringify(parsed).slice(0, 300)}`);
    }
    if (!Array.isArray(parsed.phones) || parsed.phones.length === 0) {
      throw new Error("daemon returned empty phones");
    }

    return {
      phones: parsed.phones as string[],
      tool: (parsed.tool ?? { name: "wav2vec2", model: DEFAULT_PHONEME_MODEL, device: "mps" }) as PhoneTool,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function extractPhonesViaSpawn(wavPath: string, pythonPath: string): Promise<{ phones: string[]; tool: PhoneTool }> {
  const scriptPath = phonemizeScriptPath();
  if (!fileExistsNonEmpty(scriptPath)) {
    throw new Error(`Phonemizer script not found: ${scriptPath}`);
  }

  const env = { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: "0" };
  const proc = await runCommand(pythonPath, ["--", scriptPath, "--wav", wavPath, "--model", DEFAULT_PHONEME_MODEL], {
    cwd: repoRootFromHere(),
    env,
  });

  if (!proc.ok) {
    const detail = [proc.error, proc.stderr, proc.stdout].filter(Boolean).join("\n").trim();
    throw new Error(`Phoneme extraction failed (spawn): ${detail || `exit_code=${proc.exitCode}`}`);
  }

  let parsed: any = null;
  try {
    parsed = JSON.parse(proc.stdout.trim());
  } catch {
    throw new Error(`Phoneme extraction returned non-JSON output:\n${proc.stdout.slice(0, 500)}`);
  }

  if (!parsed || parsed.ok !== true) throw new Error(`Phoneme extraction failed: ${parsed?.error || proc.stdout.slice(0, 500)}`);
  if (!Array.isArray(parsed.phones) || parsed.phones.length === 0) throw new Error("Phoneme extraction returned empty phones");

  return {
    phones: parsed.phones as string[],
    tool: (parsed.tool ?? { name: "wav2vec2", model: DEFAULT_PHONEME_MODEL, device: "mps" }) as PhoneTool,
  };
}

async function extractPhonesWav2Vec2(wavPath: string, pythonPath: string): Promise<ExtractPhonesResult> {
  const daemonDisabled = (process.env["CIRCUIT_BREAKER_PHONEMIZE_DAEMON_DISABLED"] ?? "").trim() === "1";
  let daemonError: string | undefined;

  if (!daemonDisabled) {
    try {
      const res = await extractPhonesViaDaemon(wavPath);
      return { ...res, source: "daemon" };
    } catch (e: unknown) {
      daemonError = e instanceof Error ? e.message : String(e);
      console.warn(`[listen] phonemize daemon failed, falling back to spawn: ${daemonError}`);
    }
  }

  const local = await extractPhonesViaSpawn(wavPath, pythonPath);
  return { ...local, source: "spawn", daemon_error: daemonError };
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
    await soxConvertTo16kMonoWav(refTts.mp3_path, refWav);
  }

  const pythonPath = pythonExecPath();
  let refPhones: string[] | null = null;
  let refTool: PhoneTool | null = null;
  let refExtractor: "daemon" | "spawn" = "spawn";
  let daemonError: string | undefined;

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
    const res = await extractPhonesWav2Vec2(refWav, pythonPath);
    refPhones = res.phones;
    refTool = res.tool;
    refExtractor = res.source;
    daemonError = res.daemon_error;
    try {
      fs.writeFileSync(refPhonesPath, JSON.stringify({ created_at: new Date().toISOString(), phones: refPhones, tool: refTool }, null, 2));
    } catch {
      // ignore cache write failure
    }
  }

  // 2) Ensure attempt is 16k mono wav in our own dir.
  const attemptBase = path.basename(params.attempt_wav_path).replace(/[^A-Za-z0-9_.-]+/g, "_");
  const attemptWav = path.join(attemptDir, `attempt-${Date.now()}-${attemptBase}`.replace(/\.wav$/i, "") + ".wav");
  await soxConvertTo16kMonoWav(params.attempt_wav_path, attemptWav);

  const attemptRes = await extractPhonesWav2Vec2(attemptWav, pythonPath);
  if (!daemonError && attemptRes.daemon_error) daemonError = attemptRes.daemon_error;

  // 3) Score.
  if (!refPhones || refPhones.length === 0) {
    throw new Error("Reference phones are empty");
  }
  const { edits, ops } = levenshteinTokens(refPhones, attemptRes.phones);
  const refDur = getAudioDurationSeconds(refWav);
  const attemptDur = getAudioDurationSeconds(attemptWav);
  const durationRatio = refDur > 0 ? attemptDur / refDur : 0;
  const score = computeListenScore({ edits, refLen: refPhones.length, durationRatio });

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
    score,
    edits_detail: ops,
    meta: {
      ref_extractor: refExtractor,
      attempt_extractor: attemptRes.source,
      ...(daemonError ? { daemon_error: daemonError } : {}),
    },
  };
}
