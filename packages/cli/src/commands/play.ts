import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { buildMidiFile, type MidiToken } from "../audio/midi.js";

function getEffectiveUid(): number {
  return typeof process.getuid === "function" ? process.getuid() : 0;
}

function playCacheDir(): string {
  const uid = getEffectiveUid();
  return path.join("/tmp", `circuit-breaker-audio-${uid}`);
}

function printJson(obj: unknown): void {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function fileExistsNonEmpty(p: string): boolean {
  try {
    const s = fs.statSync(p);
    return s.size > 0;
  } catch {
    return false;
  }
}

function requireNumberFlag(
  flag: string,
  value: string | undefined,
  opts: { min?: number; max?: number; integer?: boolean } = {}
): number {
  if (value === undefined) throw new Error(`Missing value for ${flag}`);
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Invalid number for ${flag}: ${value}`);
  if (opts.integer && !Number.isInteger(n)) throw new Error(`${flag} must be an integer`);
  if (typeof opts.min === "number" && n < opts.min) throw new Error(`${flag} must be >= ${opts.min}`);
  if (typeof opts.max === "number" && n > opts.max) throw new Error(`${flag} must be <= ${opts.max}`);
  return n;
}

function requireEnumFlag<T extends string>(flag: string, value: string | undefined, allowed: T[]): T {
  if (!value) throw new Error(`Missing value for ${flag}`);
  if (!allowed.includes(value as T)) {
    throw new Error(`Invalid ${flag}: ${value}. Allowed: ${allowed.join(", ")}`);
  }
  return value as T;
}

const NOTES: Record<string, number> = {
  C: 0,
  "C#": 1,
  DB: 1,
  D: 2,
  "D#": 3,
  EB: 3,
  E: 4,
  F: 5,
  "F#": 6,
  GB: 6,
  G: 7,
  "G#": 8,
  AB: 8,
  A: 9,
  "A#": 10,
  BB: 10,
  B: 11,
};

function parseNoteToMidi(note: string | undefined): number {
  if (!note) return -1;
  const upper = note.trim().toUpperCase();
  if (!upper) return -1;
  const match = upper.match(/^([A-G][#B]?)(-?\d+)$/);
  if (!match) return -1;

  const name = match[1];
  const octaveStr = match[2];
  if (!name || !octaveStr) return -1;

  const octave = parseInt(octaveStr, 10);
  const semi = NOTES[name];
  if (semi === undefined) return -1;

  const midi = 12 * (octave + 1) + semi;
  if (midi < 0 || midi > 127) return -1;
  return midi;
}

function parseSequenceToken(token: string, defaultBeats = 1): MidiToken {
  // Format: NOTE[@beats]
  // e.g. C4, C4@1, C4@0.5, R@1, _@2
  const parts = token.split("@");
  const base = parts[0];
  const beatsRaw = parts[1];

  const beats = beatsRaw ? parseFloat(beatsRaw) : defaultBeats;
  if (!Number.isFinite(beats) || beats <= 0) {
    throw new Error(`Invalid beats for token "${token}"`);
  }

  if (!base) return { type: "rest", midi: 0, beats };

  if (base.toUpperCase() === "R" || base === "_") {
    return { type: "rest", midi: 0, beats };
  }

  const midi = parseNoteToMidi(base);
  if (midi < 0) {
    throw new Error(`Invalid note token: "${token}"`);
  }

  return { type: "note", midi, beats };
}

function scaleDegreeToSemitone(degree: number, scaleType: string): number {
  const base: Record<string, number[]> = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    pentatonic: [0, 2, 4, 7, 9],
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  };

  const scale = base[scaleType];
  if (!scale) throw new Error(`Invalid scale type: ${scaleType}`);

  if (degree <= 0) throw new Error(`Invalid scale degree: ${degree}`);

  const degreeIndex = degree - 1;
  const scaleLen = scale.length;
  const octave = Math.floor(degreeIndex / scaleLen);
  const idx = degreeIndex % scaleLen;
  const step = scale[idx];
  if (step === undefined) throw new Error(`Invalid scale degree: ${degree}`);
  return step + octave * 12;
}

function degreesFromString(degreesStr: string, label: string): number[] {
  return degreesStr.split("-").map((s) => {
    const d = Number(s);
    if (!Number.isFinite(d) || d <= 0) throw new Error(`Invalid ${label} degree: ${s}`);
    return d;
  });
}

function generateScaleTokens(
  root: string,
  type: string,
  octaves: number,
  direction: "up" | "down" | "updown",
  beats: number
): MidiToken[] {
  const rootMidi = parseNoteToMidi(root);
  if (rootMidi < 0) throw new Error(`Invalid root note: ${root}`);

  const intervals: Record<string, number[]> = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    pentatonic: [0, 2, 4, 7, 9],
  };

  const semitones = intervals[type];
  if (!semitones) throw new Error(`Invalid scale type: ${type}`);
  const notes: number[] = [];

  for (let o = 0; o < octaves; o++) {
    for (const st of semitones) {
      notes.push(o * 12 + st);
    }
  }
  notes.push(octaves * 12); // Top root

  let sequence: number[] = [];
  if (direction === "up") sequence = notes;
  else if (direction === "down") sequence = [...notes].reverse();
  else if (direction === "updown") sequence = [...notes, ...[...notes].slice(0, -1).reverse()];

  return sequence.map((st) => ({
    type: "note",
    midi: rootMidi + st,
    beats,
  }));
}

function generateArpeggioTokens(
  root: string,
  quality: string,
  patternStr: string,
  beats: number
): MidiToken[] {
  const rootMidi = parseNoteToMidi(root);
  if (rootMidi < 0) throw new Error(`Invalid root note: ${root}`);

  const chordPools: Record<string, number[]> = {
    major: [0, 4, 7, 12, 16, 19, 24],
    minor: [0, 3, 7, 12, 15, 19, 24],
    dom7: [0, 4, 7, 10, 12, 16, 19, 22],
    dim: [0, 3, 6, 9, 12, 15, 18],
  };

  const degreeMap: Record<string, Record<number, number>> = {
    major: { 1: 0, 3: 4, 5: 7, 7: 11, 8: 12 },
    minor: { 1: 0, 3: 3, 5: 7, 7: 10, 8: 12 },
    dom7: { 1: 0, 3: 4, 5: 7, 7: 10, 8: 12 },
    dim: { 1: 0, 3: 3, 5: 6, 7: 9, 8: 12 },
  };

  const pool = chordPools[quality];
  if (!pool) throw new Error(`Invalid chord quality: ${quality}`);
  const mapped = degreeMap[quality] ?? degreeMap["major"];
  if (!mapped) throw new Error(`Missing degree map for quality: ${quality}`);

  const degrees = degreesFromString(patternStr, "arpeggio");

  return degrees.map((d) => {
    let st = mapped[d];
    if (st === undefined) {
      const idx = d - 1;
      st = pool[idx];
    }
    if (st === undefined) throw new Error(`Invalid arpeggio degree: ${d}`);
    return { type: "note", midi: rootMidi + st, beats };
  });
}

function generateJumpTokens(
  root: string,
  scaleType: string,
  degreesStr: string,
  beats: number
): MidiToken[] {
  const rootMidi = parseNoteToMidi(root);
  if (rootMidi < 0) throw new Error(`Invalid root note: ${root}`);

  const degrees = degreesFromString(degreesStr, "jump");

  return degrees.map((d) => {
    const st = scaleDegreeToSemitone(d, scaleType);
    return { type: "note", midi: rootMidi + st, beats };
  });
}

function generateGlideTokens(
  start: string,
  end: string,
  durationSeconds: number,
  beatsPerNote: number,
  bpm: number
): MidiToken[] {
  const startMidi = parseNoteToMidi(start);
  const endMidi = parseNoteToMidi(end);
  if (startMidi < 0) throw new Error(`Invalid start note: ${start}`);
  if (endMidi < 0) throw new Error(`Invalid end note: ${end}`);

  const steps = Math.max(1, Math.abs(endMidi - startMidi));
  const totalBeats = (durationSeconds * bpm) / 60;
  const perNoteBeats = Math.max(beatsPerNote, totalBeats / (steps + 1));

  const direction = endMidi >= startMidi ? 1 : -1;
  const notes: number[] = [];
  for (let i = 0; i <= steps; i++) {
    notes.push(startMidi + i * direction);
  }

  return notes.map((midi) => ({ type: "note", midi, beats: perNoteBeats }));
}

function generateTransposeTokens(
  root: string,
  scaleType: string,
  degreesStr: string,
  beats: number,
  rangeHigh: string,
  step: number,
  previewMult: number
): MidiToken[] {
  const rootMidi = parseNoteToMidi(root);
  if (rootMidi < 0) throw new Error(`Invalid root note: ${root}`);

  const rangeHighMidi = parseNoteToMidi(rangeHigh);
  if (rangeHighMidi < 0) throw new Error(`Invalid range high note: ${rangeHigh}`);

  const degrees = degreesFromString(degreesStr, "transpose");
  const offsets = degrees.map((d) => scaleDegreeToSemitone(d, scaleType));
  const maxOffset = Math.max(...offsets);
  const firstOffset = offsets[0];
  if (firstOffset === undefined) throw new Error("Transpose pattern cannot be empty");

  const maxRoot = rangeHighMidi - maxOffset;
  if (rootMidi > maxRoot) {
    throw new Error(
      `Root ${root} is too high for pattern (max root ${maxRoot}) with range high ${rangeHigh}`
    );
  }

  const rootsUp: number[] = [];
  for (let r = rootMidi; r <= maxRoot; r += step) rootsUp.push(r);
  const rootsDown = rootsUp.length > 1 ? rootsUp.slice(0, -1).reverse() : [];
  const roots = rootsUp.concat(rootsDown);

  const tokens: MidiToken[] = [];
  const previewBeats = beats * previewMult;
  for (let i = 0; i < roots.length; i++) {
    const r = roots[i];
    if (r === undefined) continue;
    if (i > 0 && previewMult > 0) {
      tokens.push({ type: "note", midi: r + firstOffset, beats: previewBeats });
    }
    for (const st of offsets) {
      tokens.push({ type: "note", midi: r + st, beats });
    }
  }

  return tokens;
}

function requireSoundfontPath(): string {
  const sf2Path = process.env["CIRCUIT_BREAKER_SF2_PATH"];
  if (!sf2Path) {
    throw new Error(
      "CIRCUIT_BREAKER_SF2_PATH is required (path to a .sf2 SoundFont)."
    );
  }
  if (!fileExistsNonEmpty(sf2Path)) {
    throw new Error(`SoundFont not found or empty: ${sf2Path}`);
  }
  return sf2Path;
}

function resolveFluidSynthBin(): string {
  return process.env["CIRCUIT_BREAKER_FLUIDSYNTH_BIN"] ?? "fluidsynth";
}

function ensureFluidSynthAvailable(bin: string): void {
  try {
    execFileSync(bin, ["--version"], { stdio: "ignore" });
  } catch (err) {
    throw new Error(
      `fluidsynth not found (${bin}). Install with: brew install fluidsynth`
    );
  }
}

export async function cmdPlay(args: string[], json: boolean): Promise<void> {
  const rawSubcommand = args[0];
  const subcommand = rawSubcommand && !rawSubcommand.startsWith("--") ? rawSubcommand : "seq";
  const subArgs = rawSubcommand && !rawSubcommand.startsWith("--") ? args.slice(1) : args;

  // Defaults
  let bpm = 60;
  let volume = 0.55;
  let gapMs = 15;
  let noteBeats = 1;
  let refresh = false;
  let noPlay = false;

  // Subcommand specific
  let octaves = 1;
  let direction: "up" | "down" | "updown" = "up";
  let pattern = "1-3-5-8-5-3-1";
  let degrees = "1-5-1";
  let glideSeconds = 1;
  let glideCurve: "linear" | "exp" = "exp";
  let rangeHigh = "F4";
  let step = 1;
  let previewMult = 3;

  const cleanArgs: string[] = [];

  for (let i = 0; i < subArgs.length; i++) {
    const a = subArgs[i];
    if (!a) continue;
    const next = subArgs[i + 1];

    // Common flags
    if (a === "--bpm") {
      bpm = requireNumberFlag(a, next, { min: 1 });
      i++;
      continue;
    }
    if (a === "--volume") {
      volume = requireNumberFlag(a, next, { min: 0, max: 1 });
      i++;
      continue;
    }
    if (a === "--gap-ms") {
      gapMs = requireNumberFlag(a, next, { min: 0 });
      i++;
      continue;
    }
    if (a === "--note-beats") {
      noteBeats = requireNumberFlag(a, next, { min: 0.05 });
      i++;
      continue;
    }
    if (a === "--refresh" || a === "--no-cache") {
      refresh = true;
      continue;
    }
    if (a === "--no-play") {
      noPlay = true;
      continue;
    }

    // Subcommand flags
    if (a === "--octaves") {
      octaves = requireNumberFlag(a, next, { min: 1, integer: true });
      i++;
      continue;
    }
    if (a === "--direction") {
      direction = requireEnumFlag(a, next, ["up", "down", "updown"]);
      i++;
      continue;
    }
    if (a === "--pattern") {
      if (!next) throw new Error(`Missing value for ${a}`);
      pattern = next;
      i++;
      continue;
    }
    if (a === "--degrees") {
      if (!next) throw new Error(`Missing value for ${a}`);
      degrees = next;
      i++;
      continue;
    }
    if (a === "--seconds") {
      glideSeconds = requireNumberFlag(a, next, { min: 0.1 });
      i++;
      continue;
    }
    if (a === "--curve") {
      glideCurve = requireEnumFlag(a, next, ["linear", "exp"]);
      i++;
      continue;
    }
    if (a === "--range-high") {
      if (!next) throw new Error(`Missing value for ${a}`);
      rangeHigh = next;
      i++;
      continue;
    }
    if (a === "--step") {
      step = requireNumberFlag(a, next, { min: 1, integer: true });
      i++;
      continue;
    }
    if (a === "--preview-mult") {
      previewMult = requireNumberFlag(a, next, { min: 0.5 });
      i++;
      continue;
    }

    if (a.startsWith("--")) throw new Error(`Unknown flag: ${a}`);
    cleanArgs.push(a);
  }

  let tokens: MidiToken[] = [];
  let cacheKeyBase = "";

  if (subcommand === "seq") {
    if (cleanArgs.length === 0) throw new Error("Usage: play seq <NOTE[@beats] ...> [--bpm N]");
    tokens = cleanArgs.map((t) => parseSequenceToken(t, noteBeats));
    cacheKeyBase = `seq|${cleanArgs.join(" ")}`;
  } else if (subcommand === "scale") {
    const root = cleanArgs[0] || "C4";
    const type = cleanArgs[1] || "major";
    tokens = generateScaleTokens(root, type, octaves, direction, noteBeats);
    cacheKeyBase = `scale|${root}|${type}|${octaves}|${direction}`;
  } else if (subcommand === "arpeggio") {
    const root = cleanArgs[0] || "C4";
    const quality = cleanArgs[1] || "major";
    tokens = generateArpeggioTokens(root, quality, pattern, noteBeats);
    cacheKeyBase = `arp|${root}|${quality}|${pattern}`;
  } else if (subcommand === "jumps") {
    const root = cleanArgs[0] || "C4";
    const scale = cleanArgs[1] || "major";
    tokens = generateJumpTokens(root, scale, degrees, noteBeats);
    cacheKeyBase = `jumps|${root}|${scale}|${degrees}`;
  } else if (subcommand === "glide") {
    const start = cleanArgs[0] || "C3";
    const end = cleanArgs[1] || "C4";
    tokens = generateGlideTokens(start, end, glideSeconds, noteBeats, bpm);
    cacheKeyBase = `glide|${start}|${end}|${glideSeconds}|${glideCurve}`;
  } else if (subcommand === "transpose") {
    const root = cleanArgs[0] || "A2";
    const scale = cleanArgs[1] || "major";
    tokens = generateTransposeTokens(root, scale, degrees, noteBeats, rangeHigh, step, previewMult);
    cacheKeyBase = `transpose|${root}|${scale}|${degrees}|${rangeHigh}|${step}|preview=${previewMult}`;
  } else {
    throw new Error(`Unknown play subcommand: ${subcommand}`);
  }

  const sf2Path = requireSoundfontPath();
  const fluidsynthBin = resolveFluidSynthBin();
  ensureFluidSynthAvailable(fluidsynthBin);

  const gapBeats = gapMs > 0 ? gapMs / (60000 / bpm) : 0;
  const velocity = Math.max(0, Math.min(127, Math.round(volume * 127)));

  const midiBuffer = buildMidiFile(tokens, {
    bpm,
    defaultVelocity: velocity,
    gapBeats,
  });

  // Cache logic
  const sf2Stats = fs.statSync(sf2Path);
  const settingsHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        bpm,
        noteBeats,
        gapMs,
        volume,
        sf2Path,
        sf2Size: sf2Stats.size,
        sf2Mtime: sf2Stats.mtimeMs,
      })
    )
    .digest("hex")
    .slice(0, 8);

  const fullKey = `v2|${cacheKeyBase}|${settingsHash}`;
  const fileHash = crypto.createHash("sha256").update(fullKey).digest("hex").slice(0, 24);

  const cacheDir = playCacheDir();
  fs.mkdirSync(cacheDir, { recursive: true });

  const wavPath = path.join(cacheDir, `play-${fileHash}.wav`);
  const midiPath = path.join(cacheDir, `play-${fileHash}.mid`);
  let cached = false;

  if (!refresh && fileExistsNonEmpty(wavPath)) {
    cached = true;
  } else {
    const tmpMidi = path.join(cacheDir, `play-${fileHash}.tmp-${process.pid}-${Date.now()}.mid`);
    const tmpWav = path.join(cacheDir, `play-${fileHash}.tmp-${process.pid}-${Date.now()}.wav`);
    try {
      fs.writeFileSync(tmpMidi, midiBuffer);
      fs.renameSync(tmpMidi, midiPath);

      execFileSync(
        fluidsynthBin,
        ["-ni", "-F", tmpWav, sf2Path, midiPath],
        { stdio: "ignore" }
      );

      if (!fileExistsNonEmpty(tmpWav)) {
        throw new Error("fluidsynth did not produce audio output");
      }

      fs.renameSync(tmpWav, wavPath);
    } catch (e) {
      try { fs.unlinkSync(tmpMidi); } catch {}
      try { fs.unlinkSync(tmpWav); } catch {}
      throw e;
    }
  }

  if (!noPlay) {
    try {
      execFileSync("afplay", [wavPath], { stdio: "ignore" });
    } catch (e) {
      throw new Error(`afplay failed: ${e}`);
    }
  }

  if (json) {
    printJson({
      ok: true,
      command: "play",
      subcommand,
      cached,
      played: !noPlay,
      file: wavPath,
      midi: midiPath,
      bpm,
      note_beats: noteBeats,
      volume,
      gap_ms: gapMs,
      soundfont: sf2Path,
    });
    return;
  }

  console.log(`🎵 Played ${subcommand} (${cached ? "cached" : "generated"})`);
}
