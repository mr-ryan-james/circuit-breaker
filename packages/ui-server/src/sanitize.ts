function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

// Bump this when we change speech sanitization rules in a way that should force TTS re-renders.
export const TTS_SANITIZER_VERSION = "sanitize_v1";

export function sanitizeTtsText(raw: string): string {
  const s = raw
    .normalize("NFC")
    // Never speak parentheticals (common stage directions embedded in dialogue).
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const lower = s.toLowerCase();
  if (!s) return "";
  if (lower.includes("http://") || lower.includes("https://") || lower.includes("copioni.")) return "";
  return s;
}

export function estimatedSpeakSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return clamp(0.8, 12, 0.4 + words / 2.5);
}
