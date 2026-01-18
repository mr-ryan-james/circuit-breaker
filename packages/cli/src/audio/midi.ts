import { Buffer } from "node:buffer";

export type MidiToken = {
  type: "note" | "rest";
  midi: number;
  beats: number;
  velocity?: number;
};

export type MidiBuildOptions = {
  bpm: number;
  ppqn?: number;
  program?: number;
  defaultVelocity?: number;
  gapBeats?: number;
};

const DEFAULT_PPQN = 480;

function encodeVarLen(value: number): number[] {
  let buffer = value & 0x7f;
  const bytes: number[] = [];
  while ((value >>= 7)) {
    buffer <<= 8;
    buffer |= (value & 0x7f) | 0x80;
  }
  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }
  return bytes;
}

function pushUint16BE(out: number[], value: number): void {
  out.push((value >> 8) & 0xff, value & 0xff);
}

function pushUint32BE(out: number[], value: number): void {
  out.push((value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
}

function beatsToTicks(beats: number, ppqn: number): number {
  return Math.max(1, Math.round(beats * ppqn));
}

export function buildMidiFile(tokens: MidiToken[], opts: MidiBuildOptions): Buffer {
  const bpm = opts.bpm;
  if (!Number.isFinite(bpm) || bpm <= 0) throw new Error("BPM must be > 0");

  const ppqn = opts.ppqn ?? DEFAULT_PPQN;
  const tempo = Math.round(60000000 / bpm);
  const program = opts.program ?? 0; // Acoustic Grand Piano
  const defaultVelocity = opts.defaultVelocity ?? 96;
  const gapBeats = opts.gapBeats ?? 0;
  const gapTicks = gapBeats > 0 ? beatsToTicks(gapBeats, ppqn) : 0;

  const track: number[] = [];

  const pushEvent = (delta: number, data: number[]): void => {
    track.push(...encodeVarLen(delta), ...data);
  };

  // Set tempo
  pushEvent(0, [0xff, 0x51, 0x03, (tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff]);
  // Program change
  pushEvent(0, [0xc0, program & 0x7f]);

  let pendingDelta = 0;

  for (const token of tokens) {
    if (token.type === "rest") {
      pendingDelta += beatsToTicks(token.beats, ppqn);
      continue;
    }

    const note = token.midi;
    if (!Number.isFinite(note) || note < 0 || note > 127) {
      throw new Error(`Invalid MIDI note: ${note}`);
    }

    const durationTicks = beatsToTicks(token.beats, ppqn);
    const velocity = Math.max(0, Math.min(127, Math.round(token.velocity ?? defaultVelocity)));

    pushEvent(pendingDelta, [0x90, note & 0x7f, velocity]);
    pushEvent(durationTicks, [0x80, note & 0x7f, 0]);
    pendingDelta = gapTicks;
  }

  // End of track (include any trailing rest as delta)
  pushEvent(pendingDelta, [0xff, 0x2f, 0x00]);

  const header: number[] = [];
  header.push(0x4d, 0x54, 0x68, 0x64); // MThd
  pushUint32BE(header, 6);
  pushUint16BE(header, 0); // format 0
  pushUint16BE(header, 1); // one track
  pushUint16BE(header, ppqn);

  const trackHeader: number[] = [];
  trackHeader.push(0x4d, 0x54, 0x72, 0x6b); // MTrk
  pushUint32BE(trackHeader, track.length);

  return Buffer.from([...header, ...trackHeader, ...track]);
}
