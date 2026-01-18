# SOVT / Pitch Training — Feature Plan (NOT IMPLEMENTED YET)

This document is an implementation plan for adding **SOVT + pitch practice** to Circuit Breaker.

Scope reminder: **planning only** — this doc is meant to align on design decisions + conventions before writing code.

---

## 1) Goals (what success looks like)

### User-facing behavior

- There is a new Break Card type for **SOVT / pitch training**.
- When chosen, it runs a **guided practice session**:
  - total session duration: **~15 minutes**
  - **5–8 exercises**, each **30s–2min**
  - exercises vary in **tempo** and **difficulty** (stepwise → small leaps → gentle larger jumps; slow → faster)
  - each exercise explicitly cues an SOVT technique (lip trill, straw phonation, humming/NG, voiced fricatives, etc.)
- The AI agent can reliably “run the workout” without musical improvisation:
  - deterministic sequence
  - explicit commands to play notes/patterns
  - explicit rest/breath moments
  - “stop if strain” safety cues

### System goals / conventions (must match existing style)

- **CLI helper command** pattern like Spanish `site-toggle speak`:
  - Generate audio → cache → play audio (blocking)
  - Return machine-readable output with `--json`
- **Data-driven deck**:
  - cards live under `data/cards/*.json` and are seeded into the SQLite `cards` table
- **Practice history** matches our existing “Practice Modules” convention:
  - module defined in `data/modules/*.json`
  - `site-toggle module <slug> history|complete|resume|last` works
  - completion tracking is explicit (sessions are “open” until `module ... complete`)

---

## 2) Key decisions (lock these before coding)

### A) Module slug (DECIDED)

- Module slug will be: **`sovt`**
- This should mirror Spanish’s convention (`slug: spanish` matches tag `spanish`):
  - **All SOVT/pitch cards MUST include the tag `sovt`**
  - The SOVT module matches via `tags_any: ["sovt"]`

### B) “Only SOVT/pitch” (DECIDED)

- For now, we are **not** building general singing practice modules.
- We will reserve `sovt` as a **module-membership tag** (do not use it for “non-SOVT singing” in the future).

### C) Break menu lane (NEEDS DECISION, but recommended below)

We likely want a dedicated Break lane (like `verb`/`noun`/`lesson`) so SOVT feels first-class.

Recommendation:
- Add a lane named **`sovt`** (aligns with module slug/tag and keeps the mental model simple).

UX note:
- This adds **one more choice** to the break menu.
- When fusion is present, the menu becomes **8 options** (same_need + physical + verb + noun + lesson + sovt + fusion + feed).

### D) 10-minute selection constraint vs 15-minute session (NEEDS DECISION)

Current reality:
- `packages/core/src/engine/break.ts` hardcodes `maxMinutes = 10` for card selection.
- A card with `minutes: 15` **will not show up** in any lane unless we explicitly change selection behavior.

We must choose one:
1) **Preferred**: lane-specific override  
   - keep existing lanes at `maxMinutes=10`
   - make the `sovt` lane use `maxMinutes=15`
   - set SOVT card `minutes: 15` so re-entry timing is honest
2) “10 + optional 5” in prompt (no engine changes, weaker UX)  
   - card remains `minutes: 10` so it appears today
   - prompt includes a suggested optional bonus block to reach ~15
   - downside: re-entry timing mismatches reality if you actually do 15

Recommendation:
- Choose (1) lane-specific override (minimal-change + honest timing).

---

## 3) Critical integration points (what must align with existing conventions)

### 3.1 Modules integration (ESSENTIAL)

Without a module JSON file, the feature “works” (audio playback + card prompt), but it will NOT align with how we track practice history in this repo.

We must add:

**Proposed file**: `data/modules/sovt.json`

```json
{
  "version": 1,
  "slug": "sovt",
  "name": "SOVT / Pitch",
  "match": {
    "tags_any": ["sovt"]
  },
  "completion": {
    "parts_suggestions": ["warmup", "exercises", "cooldown"]
  }
}
```

Why this matches our system:
- The CLI module system is generic; it only needs a module definition + tags.
- SOVT sessions chosen via Break (`card_chosen` events) will appear in module history because:
  - module history scans `card_chosen` / `practice_started` events
  - it filters sessions by **card tags** via `moduleMatchesTags()`

### 3.2 Completion tracking (ESSENTIAL)

To keep history consistent with Spanish:
- after a SOVT session, the agent should run:

```bash
./site-toggle module sovt complete --status completed --json
```

Notes / conventions:
- If there are multiple open sessions, `complete` will require **both** `--event-key` and `--card-id`, identical to Spanish.

### 3.3 “play” must be non-root (ESSENTIAL)

Unlike `on/off/choose feed`, **`play` must never need sudo**.

This should be documented clearly:
- “`play` is safe; no `/etc/hosts` writes; no sudo.”

### 3.4 Cache strategy must match existing conventions (IMPORTANT)

The existing `speak` cache convention is:
- cache directory is keyed by **effective uid** (`process.getuid()`), not “real sudo user”
- sudo runs use uid=0 cache dir

That is intentionally safe:
- root won’t accidentally write into the user’s cache directory and create permission problems.

For `play`, we should follow the same convention (effective uid cache dir).

---

## 4) Recommended approach for `site-toggle play` (macOS)

### Why we want a `play` command

The agent needs a deterministic way to:
- play notes and patterns (scales, arpeggios, interval jumps, glides)
- vary tempo and durations
- do it offline (no dependency on a cloud TTS service)

### Compare approaches

**Approach A — Node/TS synthesize PCM WAV offline (recommended)**
- Generate a WAV file (mono PCM 16-bit), cache it, then play with `afplay`.
- Pros:
  - offline
  - minimal new dependencies (fits repo)
  - mirrors existing `cmdSpeak` pattern: normalize → hash → atomic write → `afplay`
- Cons:
  - tones are “clinical” (sine/triangle), but that’s OK for pitch/SOVT.

**Approach B — Swift helper (AVFoundation)**
- Pros: higher-level audio scheduling, potentially better sound.
- Cons: introduces build/distribution complexity (binary, compilation, codesigning friction).

**Approach C — external tools (sox/fluidsynth/etc.)**
- Cons: dependency drift and missing-tool failures (bad for agent reliability).

Recommendation: start with Approach A.

### Audio quality requirements (must-haves)

- Avoid clicks/pops at note boundaries:
  - implement short **attack/release envelope** per note (e.g., 8ms attack, 25ms release).
- Conservative loudness:
  - default should be safe at typical system volume (and allow explicit `--volume` override).
- Timing accuracy:
  - duration should match expected timing within reasonable tolerance (±50ms).

---

## 5) Proposed CLI contract for `play` (agent-friendly)

Guiding rules (matches existing CLI style):
- no quoting required for common use
- deterministic output for agents via `--json`
- caching supported via `--refresh`
- blocking playback (like `afplay` usage in `speak`)

### Minimal v1 surface (enables early progress)

**Core**:
- `site-toggle play seq <token...> [flags]`
- `site-toggle play glide <start> <end> [flags]` (optional in v1, but very useful for SOVT sirens)

**Token encoding** (for `seq`)
- `NOTE[@beats]` separated by whitespace
- notes like: `C4`, `F#3`, `Bb2`
- rest token: `R@1` (or `_@1`)

Example:
```bash
./site-toggle play seq --bpm 72 C4@1 D4@1 E4@1 F4@1 G4@2 R@1 G4@1 F4@1 E4@1 D4@1 C4@2 --json
```

### Full v1 surface (recommended if we want “nice” prompts)

- `play scale <root> <major|minor|chromatic|pentatonic> [--octaves N] [--direction up|down|updown]`
- `play arpeggio <root> <quality> [--pattern 1-3-5-8-5-3-1]`
- `play jumps <root> <scale> --degrees 1-5-1-8-1 ...`
- `play glide <start> <end> --seconds N [--curve exp|linear]`

### Shared flags (recommended)

- `--bpm <int>` (default 60)
- `--note-beats <float>` (default 1)
- `--rest-beats <float>` (default 0)
- `--wave <sine|triangle>` (default `sine`)
- `--volume <0.0..1.0>` (default ~0.55)
- `--attack-ms <int>` (default 8)
- `--release-ms <int>` (default 25)
- `--gap-ms <int>` (default 15)
- `--refresh` (bypass cache)
- `--no-play` (render + json only)

### `--json` output shape (match `speak` style)

Return:
- `ok`, `command:"play"`, `cached`, `played`
- `file` path
- summary of notes/timeline for agent debugging

---

## 6) Card design: SOVT session as a prompt-driven “script”

This repo’s convention is: **the card prompt is the program**.

We should keep SOVT consistent:
- The card prompt should contain a clearly delimited section like:
  - `SCRIPT (do not improvise; run in order)`
- Each exercise should specify:
  - duration target (e.g., 90s)
  - SOVT technique
  - cue sentence
  - exact `site-toggle play ... --json` command(s)
  - explicit rest/breath moment
- Include simple self-check questions (agent asks, user answers):
  - “Easy? Any strain? If yes, stop / transpose down / reduce tempo.”

Safety / tone conventions:
- neutral, autonomy-supportive (like other cards)
- include “stop if strain” without moralizing
- keep volume guidance explicit

---

## 7) Break menu integration (lane + minutes)

Recommendation:
- Add a Break lane: **`sovt`**
- Selection strategy:
  - `tagsAll: ["sovt"]` (or `tagsAll: ["sovt","pitch"]` if we decide to require both)
  - but keep module membership strictly by `sovt`

Minutes strategy (recommended):
- SOVT card minutes = **15**
- SOVT lane selection uses `maxMinutes=15`
- other lanes remain `maxMinutes=10`

Lane ordering (stable):
1. `same_need`
2. `physical`
3. `verb`
4. `noun`
5. `lesson`
6. `sovt`
7. `fusion` (only if available)
8. `feed`

---

## 8) Testing strategy (pragmatic)

We should be able to validate this feature without heroic infra:

### Unit tests (recommended)
- note parsing (`C4`, `F#3`, `Bb2`, invalid inputs)
- A4=440 mapping; octave math sanity
- duration math from bpm/beat values
- WAV header correctness
- cache key stability (same args → same file hash)

### Manual verification checklist (recommended)
- pitch accuracy: confirm with tuner app on sustained A4
- tempo sanity: compare to metronome at 60/80/96 bpm
- no clicks/pops at note boundaries
- end-to-end agent run: prompt stays deterministic, doesn’t improvise

---

## 9) Documentation updates (so agents can run it reliably)

Update these docs to mirror the Spanish “speak” guidance:
- `README.md`
- `AGENTS.md`
- `claude.md`
- `GEMINI.md`

Add sections:
- `site-toggle play` command reference + examples
- “SOVT / Pitch practice flow” (when to play audio; avoid spam)
- module usage:
  - `./site-toggle module sovt history --days 7 --json`
  - `./site-toggle module sovt complete --status completed --json`

Explicitly state:
- macOS-only (uses `afplay`)
- no sudo needed
- safety/volume caveats

---

## 10) Phased implementation plan (sequenced to reduce risk)

### Phase 0 — Design lock-in (this doc review)
- Decide lane name (`sovt` recommended)
- Decide minutes strategy (lane override recommended)
- Confirm module slug/tag strategy (`sovt` decided)

### Phase 1 — Implement `site-toggle play` minimal core
- Implement offline WAV synthesis + caching + playback (`afplay`)
- Support `--json`, `--refresh`, safe defaults
- Implement either:
  - `play seq` only, plus `play glide` if feasible

### Phase 2 — Expand play ergonomics (optional but likely)
- Add `scale`, `arpeggio`, `jumps`, `glide` subcommands
- Keep parsing rules strict and small (avoid DSL creep)

### Phase 3 — Add SOVT cards + module definition
- Add `data/modules/sovt.json`
- Add `data/cards/*` SOVT practice cards (tagged with `sovt`)
- Ensure card minutes align with lane selection strategy

### Phase 4 — Break lane integration
- Add `sovt` lane to break menu + choose support + docs
- Ensure lane-specific `maxMinutes=15` (if chosen)

---

## 11) Open questions (for you to answer before build)

1) Are we comfortable with the break menu occasionally showing **8 options** (when fusion exists + sovt exists)?
2) Should the lane name be `sovt` (recommended) or something like `voice`?
3) Do you want one SOVT card (15 min) or multiple variants (beginner + intermediate)?

