import React from "react";

export type PitchTimelineFrame = { t_ms: number; hz: number | null; clarity: number };

export type PitchTimelineNote = {
  idx: number;
  note: string;
  expected_hz: number;
  start_ms: number;
  end_ms: number;
  ok?: boolean;
};

function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

function clamp(min: number, max: number, v: number): number {
  return Math.max(min, Math.min(max, v));
}

export function PitchTimeline(props: {
  durationMs: number;
  notes: PitchTimelineNote[];
  contour: PitchTimelineFrame[];
  okCents?: number;
  clarityThreshold?: number;
  heightPx?: number;
}) {
  const { durationMs, notes, contour, okCents = 35, clarityThreshold = 0.65, heightPx = 220 } = props;
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [widthPx, setWidthPx] = React.useState<number>(0);

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setWidthPx(el.clientWidth);
    });
    ro.observe(el);
    setWidthPx(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!widthPx || widthPx <= 0) return;
    if (!durationMs || durationMs <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(widthPx * dpr);
    canvas.height = Math.floor(heightPx * dpr);
    canvas.style.width = `${widthPx}px`;
    canvas.style.height = `${heightPx}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Figure out Y range from both expected notes and detected contour.
    const midiVals: number[] = [];
    for (const n of notes) midiVals.push(hzToMidi(n.expected_hz));
    for (const p of contour) if (p.hz) midiVals.push(hzToMidi(p.hz));

    const minMidiRaw = midiVals.length > 0 ? Math.min(...midiVals) : 48;
    const maxMidiRaw = midiVals.length > 0 ? Math.max(...midiVals) : 72;
    const minMidi = Math.floor(minMidiRaw) - 2;
    const maxMidi = Math.ceil(maxMidiRaw) + 2;
    const midiSpan = Math.max(1, maxMidi - minMidi);

    const xForMs = (tMs: number) => (clamp(0, durationMs, tMs) / durationMs) * widthPx;
    const yForMidi = (midi: number) => heightPx - ((midi - minMidi) / midiSpan) * heightPx;

    // Background
    ctx.clearRect(0, 0, widthPx, heightPx);

    // Grid
    ctx.strokeStyle = "rgba(148, 163, 184, 0.25)"; // slate-ish
    ctx.lineWidth = 1;
    for (let m = Math.ceil(minMidi); m <= Math.floor(maxMidi); m += 1) {
      const y = yForMidi(m);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(widthPx, y);
      ctx.stroke();
    }

    // Expected notes as bands (+/- ok cents)
    const bandSemitones = okCents / 100;
    for (const n of notes) {
      const start = clamp(0, durationMs, n.start_ms);
      const end = clamp(0, durationMs, n.end_ms);
      if (end <= start) continue;

      const midi = hzToMidi(n.expected_hz);
      const yTop = yForMidi(midi + bandSemitones);
      const yBot = yForMidi(midi - bandSemitones);
      const rectH = Math.max(1, yBot - yTop);

      const x = xForMs(start);
      const w = Math.max(1, xForMs(end) - x);

      const ok = Boolean(n.ok);
      ctx.fillStyle = ok ? "rgba(34, 197, 94, 0.20)" : "rgba(148, 163, 184, 0.14)";
      ctx.fillRect(x, yTop, w, rectH);
    }

    // Detected contour points
    for (const p of contour) {
      if (!p.hz) continue;
      const x = xForMs(p.t_ms);
      const y = yForMidi(hzToMidi(p.hz));
      const strong = p.clarity >= clarityThreshold;
      ctx.fillStyle = strong ? "rgba(59, 130, 246, 0.85)" : "rgba(148, 163, 184, 0.55)";
      ctx.beginPath();
      ctx.arc(x, y, strong ? 1.6 : 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [widthPx, heightPx, durationMs, notes, contour, okCents, clarityThreshold]);

  return (
    <div ref={wrapRef} className="w-full rounded-md border bg-muted/10 p-2">
      <canvas ref={canvasRef} />
    </div>
  );
}

