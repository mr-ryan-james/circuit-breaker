# Circuit Breaker - Claude Instructions

This folder contains Ryan's circuit breaker system for managing distracting websites on macOS.

## Quick Start (Agents / CLI)

If you're an agent (Claude/Codex) and you need to operate the blocker, this is the fastest reliable path:

All commands below assume your working directory is `~/Dev/circuit-breaker`. If not, replace `./site-toggle` with `~/Dev/circuit-breaker/site-toggle`.

**Spanish test mode** (when Ryan says "quiz me", "test me", "give me a test"):
```bash
./site-toggle module spanish test --json              # 20 questions
./site-toggle module spanish test --count 10 --json   # custom count
```

1. **Sanity check:** `./site-toggle doctor`
2. **Set current context (important for Break Cards):**
   - `./site-toggle context set home` **or** `./site-toggle context set coworking`
   - Or set env var: `CIRCUIT_BREAKER_CONTEXT=home` / `CIRCUIT_BREAKER_CONTEXT=coworking`
3. **Ensure a deck exists (optional if already seeded):**
   - `./site-toggle seed` (loads all `data/cards/*.json|*.csv|*.tsv` into SQLite)
   - Or `./site-toggle import cards /path/to/cards.csv`
4. **Preferred unblock flow (generates 7-option menu automatically when fusion is available):**
   - `./site-toggle break reddit --json`
   - If Ryan chooses same-need: `./site-toggle choose <event_key> same_need --json`
   - If Ryan chooses physical: `./site-toggle choose <event_key> physical --json`
   - If Ryan chooses verb: `./site-toggle choose <event_key> verb --json`
   - If Ryan chooses noun: `./site-toggle choose <event_key> noun --json`
   - If Ryan chooses B1/B2 lesson: `./site-toggle choose <event_key> lesson --json`
   - If Ryan chooses fusion: `./site-toggle choose <event_key> fusion --json`
   - If Ryan chooses feed: `sudo -n ./site-toggle choose <event_key> feed --json`
   - (Legacy aliases: `card` = first card lane, `card2` = second card lane)

## When Ryan Asks to Unblock Sites

Ryan ultimately wants autonomy. Your job is to add a brief, non-preachy pause and offer better options — while still complying.

### Protocol: Alternatives → Menu → Execute

**REQUIRED — ALWAYS query the break command:** For EVERY unblock request, run `./site-toggle break <site> --json` to generate a fresh menu. This applies even on repeat requests in the same session. NEVER skip the query or invent alternatives from memory — always pull a fresh Break Card from the database.

The break command returns 7 lanes when fusion is available (fusion only appears when verb+noun+lesson lanes were found):
- a **same-need** prompt (lane `same_need`)
- a **Physical** Break Card (lane `physical`)
- a **Spanish Verb** Break Card (lane `verb`)
- a **Spanish Noun** Break Card (lane `noun`)
- a **Spanish B1/B2 Lesson + Quiz** Break Card (lane `lesson`)
- a **Fusion** Break Card (lane `fusion`) — 7-minute integrated drill combining the selected verb+noun+lesson
- the **unblock option** (lane `feed`)

**Step 1: Query and present all 7 lanes**
Run `./site-toggle break <site> --json` and present the options.

**Step 2: Give the unblock option**
After the alternatives, offer a focused 10 min window (or whatever Ryan explicitly requests).

**Step 3: Execute immediately if Ryan chooses**
- Don't force multiple turns — if Ryan says "just do it" or picks an option, execute
- After running, confirm what changed and when it auto-reblocks

### Example Responses

**Standard response (7 options, five different card lanes):**

Note: Lane order is stable. Use the lane name (physical/verb/noun/lesson) + `category` field from JSON for labels.

```
Before I unblock Twitter — seven options:

1. Same-need — What are you looking for? I'll find it.
2. Quick walk — 5 min (physical)
3. Verb drill — 5 min (verb)
4. Noun drill — 5 min (noun)
5. B1/B2 lesson — 10 min (lesson)
6. Fusion — 7 min integrated drill (fusion)
7. Feed — 10 min window

┌─ Physical Card (option 2) ────────────────────────┐
│                                                   │
│  QUICK WALK                                       │
│  Physical · 5 min                                 │
│                                                   │
│  Walk to end of block and back.                   │
│  Done when you return.                            │
│                                                   │
│  → "2" to start                                   │
└───────────────────────────────────────────────────┘

┌─ Verb Card (option 3) ────────────────────────────┐
│                                                   │
│  PERTENECER (to belong)                           │
│  Irregular -zco verb · 5 min                      │
│                                                   │
│  Prompt:                                          │
│  Quiz me on the Spanish verb PERTENECER. Test me  │
│  on all 6 conjugations for presente, indefinido,  │
│  imperfecto. Castilian Spanish with vosotros.     │
│                                                   │
│  → "quiz me" or "3" to start                      │
└───────────────────────────────────────────────────┘

┌─ Noun Card (option 4) ────────────────────────────┐
│                                                   │
│  AGUA (water)                                     │
│  Noun · 5 min                                     │
│                                                   │
│  Prompt:                                          │
│  Quiz me on “agua”: gender/article (el agua),     │
│  plural (las aguas), and 5 example sentences.     │
│                                                   │
│  → "quiz me" or "4" to start                      │
└───────────────────────────────────────────────────┘

┌─ B1/B2 Lesson Card (option 5) ────────────────────┐
│                                                   │
│  SUBJUNCTIVE TRIGGERS (Wishes/Emotion/Doubt)      │
│  Grammar · 10 min                                 │
│                                                   │
│  Prompt:                                          │
│  Teach → 5 examples → 15-question quiz.           │
│                                                   │
│  → "5" to start                                   │
└───────────────────────────────────────────────────┘

┌─ Fusion Card (option 6) ──────────────────────────┐
│                                                   │
│  FUSION (verb + noun + B1/B2)                     │
│  Learning · 7 min                                 │
│                                                   │
│  7 quick questions that combine today’s verb,     │
│  noun, and B1/B2 concept.                         │
│                                                   │
│  → "6" to start                                   │
└───────────────────────────────────────────────────┘

Your call — 1, 2, 3, 4, 5, 6, or 7?
```

**When Ryan says "unblock everything":**

Still run `./site-toggle break twitter --json` (or any site) to get fresh card alternatives. Present the 7 options, but adapt the feed lane to "unblock all":

```
Before I unblock everything — seven options:

1. Same-need — What are you looking for? I'll find it.
2. Quick walk — 5 min (physical)
3. Verb drill — 5 min (verb)
4. Noun drill — 5 min (noun)
5. B1/B2 lesson — 10 min (lesson)
6. Fusion — 7 min integrated drill (fusion)
7. Feed — 10 min window for all 23 sites

[Show the four card boxes as usual]

Your call — 1, 2, 3, 4, 5, 6, or 7?
```

If Ryan picks 7 (feed), run: `sudo -n ./site-toggle on "" 10`

**When Ryan says "just do it" or picks unblock:**
> [runs command immediately, no more friction]
> "Done. Twitter unblocked for 10 min."

### Critical Rules

1. **ALWAYS run `./site-toggle break <site> --json`** for every unblock request — never skip the query or make up alternatives from memory, even on repeat requests in the same session
2. **Never run `site-toggle on` with no site** unless Ryan explicitly says "unblock everything" or "unblock all sites"
3. **Default to shorter durations** — don't rely on the script's 30-min default
4. **Prefer per-site unblocks** over "unblock all"
5. **No lectures or moralizing** — autonomy-supportive, not preachy
6. **Vary your suggestions** — the break command handles this automatically by pulling fresh cards

### Adaptive Friction (optional, use judgment)

Run `sudo ~/Dev/circuit-breaker/site-toggle stats` to check usage patterns. The stats command always calculates based on **current time** (safe for long-running sessions).

**When to check stats:** Optionally before responding to an unblock request, especially if it feels like a high-frequency day.

**IMPORTANT:** Friction level affects **phrasing and tone**, NOT whether to query the break command. You MUST still run `./site-toggle break <site> --json` every time — friction just changes how you frame the options.

**How to calibrate friction:**

| Today's pattern | Friction level | What changes |
|-----------------|----------------|--------------|
| First request | Light | Present the 7 options matter-of-factly, no stats mention |
| 2-3 requests | Light-medium | Present 7 options, maybe note "quick check: what are you looking for?" |
| 4+ requests | Medium | Present 7 options + brief awareness: "that's your 4th today" |
| 60+ min already today | Medium | Present 7 options + brief awareness: "you've had about an hour today" |

In ALL cases: query `./site-toggle break`, present the options, comply if Ryan chooses feed.

**Tone rules for stats mentions:**
- Use **coarse language** ("a few times", "about an hour") not exact counts unless Ryan asks
- **Never sound judgmental** — just awareness, then comply
- **Don't mention stats every time** — use sparingly when it adds value
- If Ryan says "just do it" after a stats mention, comply immediately without further comment

### Default Durations (pass explicit minutes)

| Category | Sites | Default |
|----------|-------|---------|
| Social | twitter, reddit | 10 min |
| News | nytimes, cnn, bloomberg, wsj, cnbc, ft, marketwatch, businessinsider, reuters, theatlantic, washingtonpost, theguardian, bbc, npr, politico, axios, vox | 10 min |
| Tech | techcrunch, theverge, wired, arstechnica | 10 min |

### Spanish Pronunciation Audio (TTS)

Use `site-toggle speak` to play Spanish pronunciation audio during Spanish learning cards.

**One-time setup:**
```bash
pipx install edge-tts   # or: pip install edge-tts
```

**Basic usage (default Castilian voice):**
```bash
./site-toggle speak "vincular"
./site-toggle speak cómo estás   # multi-word, no quotes needed
```

**Choose a different voice:**
```bash
./site-toggle speak "vincular" --voice es-ES-ElviraNeural  # Spain, female
./site-toggle speak "vincular" --voice es-MX-JorgeNeural   # Mexico, male
```

**Agent guidance (when to use):**
- **On request**: If Ryan says "pronounce it", "say it", "how do you say X"
- **At card start**: Follow the Spanish Card Presentation Flow below
- **After each answer**: Follow the Post-Answer Audio Flow below
- **Avoid autoplay spam**: Only play audio at the defined points (card start, post-answer)

**Spanish Card Presentation Flow:**

When Ryan selects a Spanish learning card, follow this sequence:

1. **Play the word** (infinitive for verbs, base form for nouns):
   ```bash
   ./site-toggle speak "vincular"
   ```

2. **State the meaning and type**:
   > "VINCULAR — to link or connect. Regular -AR verb."

3. **Generate an example sentence** using one conjugation, then play it:
   ```bash
   ./site-toggle speak "Quiero vincular estas ideas con el proyecto"
   ```
   > "Quiero vincular estas ideas con el proyecto" — I want to link these ideas to the project.

4. **Start the quiz** using the card's prompt.

**Example full presentation:**
```
[plays audio: "vincular"]

VINCULAR — to link or connect. Regular -AR verb.

[plays audio: "Quiero vincular estas ideas con el proyecto"]
"Quiero vincular estas ideas con el proyecto" — I want to link these ideas to the project.

Ready to practice? Give me all 6 presente forms:
yo, tú, él/ella, nosotros, vosotros, ellos/ellas
```

**Tips for example sentences:**
- Use common, practical contexts (work, daily life, relationships)
- Vary the tense/person across different cards (don't always use yo presente)
- Keep sentences short enough to be useful for listening practice (8-12 words max)

**Post-Answer Audio Flow:**

After Ryan answers a tense (all 6 conjugations), follow this sequence:

1. **Grade the answers** — mark correct/incorrect as usual

2. **Play ALL 6 forms** in order (not just corrections):
   ```bash
   ./site-toggle speak "vinculo, vinculas, vincula, vinculamos, vinculáis, vinculan"
   ```
   Play them as a single phrase so Ryan hears the rhythm of the conjugation pattern.

3. **Pick one form and use it in a sentence**:
   ```bash
   ./site-toggle speak "Nosotros vinculamos el arte con la vida cotidiana"
   ```
   > "Nosotros vinculamos el arte con la vida cotidiana" — We link art to everyday life.

4. **Continue to the next tense** (or wrap up if done).

**Example post-answer output:**
```
Presente results: 6/6 correct!

[plays audio: "vinculo, vinculas, vincula, vinculamos, vinculáis, vinculan"]

[plays audio: "Nosotros vinculamos el arte con la vida cotidiana"]
"Nosotros vinculamos el arte con la vida cotidiana" — We link art to everyday life.

Ready for indefinido? Give me all 6 forms:
yo, tú, él/ella, nosotros, vosotros, ellos/ellas
```

**Tips for post-answer sentences:**
- Pick a different person each time (yo, tú, nosotros, etc.) — don't always use yo
- Match the tense just practiced (presente sentence after presente, indefinido after indefinido)
- Vary sentence complexity — some simple, some with subordinate clauses

**End-of-Session Review (required):**

After completing all tenses, offer to play **every conjugation form in its own sentence**. This reinforces all 18 forms (6 per tense × 3 tenses) in context.

1. **Offer the review**: "Want to hear all 18 forms in sentences?"
2. **If yes**, generate a unique sentence for each form and play them one by one:
   ```
   [plays audio: "Yo presencio muchos cambios en esta ciudad"]
   **Yo presencio muchos cambios en esta ciudad** — I witness many changes in this city.

   [plays audio: "Tú presencias cosas increíbles en tu trabajo"]
   **Tú presencias cosas increíbles en tu trabajo** — You witness incredible things at your job.

   ... (continue for all 18 forms)
   ```
3. **Group by tense** for clarity: all 6 presente, then all 6 indefinido, then all 6 imperfecto.

This is the final reinforcement step — don't skip it. If Ryan declines, proceed to awarding feed time.

**Available voices:**
- `es-ES-AlvaroNeural` — Spain, male (default, matches Castilian/vosotros)
- `es-ES-ElviraNeural` — Spain, female
- `es-MX-JorgeNeural` — Mexico, male
- `es-MX-DaliaNeural` — Mexico, female

**Caching:**
Audio files are cached in `/tmp/circuit-breaker-audio-<uid>/` — same text+voice combo won't regenerate.
Use `--refresh` to force regeneration if needed.

**Notes:**
- `speak` does NOT require sudo
- Command is blocking (waits for audio to finish) — prevents overlapping audio
- Requires internet connection (uses Microsoft Edge TTS service)
- Use `--json` when calling from an agent flow

### Practice Modules (History + Completion)

Modules provide a plugin-like way to track practice history (served vs started sessions) and mark completion status, without hard-coding Spanish-specific logic into the CLI.

Modules are defined in `data/modules/*.json` and match cards by tags (e.g. Spanish cards have the `spanish` tag).

**List modules:**
```bash
./site-toggle modules
```

**Spanish memory process (default shows both sessions + served):**
```bash
./site-toggle module spanish history --days 7 --limit 5 --served-limit 5 --json
```

**Narrow view / filters:**
```bash
./site-toggle module spanish history --only sessions --status open
./site-toggle module spanish history --only served
./site-toggle module spanish history --unique
```

**Redo / resume:**
```bash
./site-toggle module spanish resume --json   # continue most recent open session (no new event)
./site-toggle module spanish last --json     # start a new attempt of most recent practice
./site-toggle module spanish start 42 --json
./site-toggle module spanish start learning.spanish.verb.labrar.v1 --json
```

**Mark outcome (required):**
```bash
# Simple case (only one open session exists):
./site-toggle module spanish complete --status completed
./site-toggle module spanish complete --status partial --parts presente --note "ran out of time"
./site-toggle module spanish complete --status abandoned --note "interrupted"

# Multiple open sessions — must specify BOTH event-key AND card-id:
./site-toggle module spanish complete --event-key evt_abc123 --card-id 1457 --status completed
```

**Multiple open sessions:** If `complete` fails with "Multiple open sessions found", the error message lists them with `event_key` and `card_id`. You must provide **both** flags together — `--event-key` alone is not enough.

**Agent workflow (Spanish sessions):**

1. **Before starting a Spanish practice:**
   - Run `./site-toggle module spanish history --days 7 --limit 5 --json`
   - If open sessions exist → offer to `resume` (continues existing session)
   - If recent completed/partial sessions exist → offer to `last` (redo as new attempt)
   - Otherwise proceed with Break card selection or `start <card_id>`

2. **When Ryan chooses a Spanish card from Break menu:**
   - The `choose <event_key> verb|noun|lesson|fusion` commands already log `card_chosen` (legacy aliases: `card`, `card2`)
   - This counts as a started session — no extra `start` needed
   - **Save the `event_key` and `card_id`** from the choose response — you'll need both for `complete`

3. **After finishing a Spanish drill:**
   - **Always** run `module spanish complete --status <status>`
   - `completed` — all tenses + review18 done
   - `partial --parts presente,indefinido` — stopped early, note which parts done
   - `abandoned --note "reason"` — interrupted, didn't finish
   - If multiple open sessions exist, use `--event-key <k> --card-id <id>` (both required)
   - If you forget to complete, the session stays "open" and will show up on next `resume`

4. **Key principle:** Completion tracking is explicit. Sessions are "open" until marked complete. This is intentional — it lets Ryan pick up where he left off.

### Spanish Test Mode

Test Ryan on **completed Spanish verbs**. The CLI returns a verb pool only; the agent constructs questions and grades using Spanish knowledge.

**Trigger phrases** — run the test command when Ryan says:
- "quiz me" / "test me" / "give me a test"
- "Spanish test" / "verb test"
- "quiz me with N questions" (use `--count N`)

**Start a test:**
```bash
./site-toggle module spanish test --json
./site-toggle module spanish test --count 10 --json  # for specific count
```

**Pool size:** CLI returns a randomized subset of completed verbs (limited to keep context small). If fewer verbs exist than requested, the test will be shorter.

**Agent flow (default = fill‑in‑the‑blank):**
1. Present overview (N questions, mixed tenses: presente/indefinido/imperfecto).
2. **Do NOT list the verb pool.** Start Q1 immediately after the overview.
3. **Use the provided picks** from JSON: each verb includes a random `tense` + `person`. Do **not** re-randomize unless those fields are missing.
4. Ask a **fill‑in‑the‑blank** sentence that forces that tense/person.
   - Avoid “give me all 6 forms” unless Ryan asks.
   - Avoid definition‑only prompts.
5. After each answer (correct OR incorrect):
   - Grade the answer
   - **Show English translation** of the correct Spanish (e.g., "anduve = I walked" or full sentence "Nosotros tenemos mucha suerte = We have a lot of luck")
   - Play TTS of the correct sentence
6. Final score summary, then log completion:
```bash
./site-toggle module spanish test-complete <event_key> --score 17 --total 20 --json
```

**Notes:**
- The CLI does **not** provide answer keys. The agent builds and grades dynamically.
- Accept minor accent/spelling variations when reasonable.
- Use the existing `site-toggle speak` flow after every answer.
- Favor fill‑in‑the‑blank (~70% of questions); mix in quick_form/imp_vs_indef occasionally.
- If you want to mention the pool at all, show at most 2–3 verbs as examples, not the full list.

**Fill‑in‑the‑blank template (use by default):**
```
┌─ Question 3/10 ────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                                            │
│  Complete the sentence (pretérito indefinido, tú):                                                         │
│                                                                                                            │
│  "Ayer _______ temprano a casa."  (llegar)                                                                 │
│                                                                                                            │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Quick_form template (optional):**
```
┌─ Question 7/10 ────────────────────────────────────────────────────────────────────────────────────────────┐
│  Quick! DAR · imperfecto · nosotros                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Command Reference

```bash
# Safe / non-root commands (no /etc/hosts writes)
./site-toggle doctor
./site-toggle status
./site-toggle stats
./site-toggle seed
./site-toggle contexts
./site-toggle locations
./site-toggle context set home
./site-toggle context set coworking
./site-toggle break reddit --json
./site-toggle choose <event_key> physical --json
./site-toggle choose <event_key> verb --json
./site-toggle choose <event_key> noun --json
./site-toggle choose <event_key> lesson --json
./site-toggle choose <event_key> fusion --json
./site-toggle speak "vincular"
./site-toggle speak "cómo estás" --voice es-MX-JorgeNeural
./site-toggle modules
./site-toggle module spanish history --days 7 --limit 5 --json
./site-toggle module spanish test --json                # 20 questions from completed verbs
./site-toggle module spanish test --count 10 --json     # custom question count
./site-toggle module spanish test-complete <event_key> --score 8 --total 10 --json
./site-toggle module spanish complete --status completed

# Manual unblock/block (requires sudo because it edits /etc/hosts)
sudo -n ./site-toggle on reddit 10
sudo -n ./site-toggle off reddit

# Unblock/block ALL sites (only if explicitly requested)
sudo -n ./site-toggle on                 # unblock all (default minutes per site)
sudo -n ./site-toggle on "" 10           # unblock all for 10 minutes
sudo -n ./site-toggle off                # block all

# Break menu choice (feed lane requires sudo because it unblocks in /etc/hosts)
sudo -n ./site-toggle choose <event_key> feed --json

# Rate a Break Card (affects future selection weight)
./site-toggle rate <card_id> love    # 2.0x weight - show more often
./site-toggle rate <card_id> ok      # 1.0x weight - normal frequency
./site-toggle rate <card_id> meh     # 0.25x weight - show rarely
./site-toggle rate <card_id> ban     # 0.0x weight - never show again

# Import/upload (additive upserts; no deletes)
./site-toggle import cards /path/to/cards.json
./site-toggle import cards /path/to/cards.csv
./site-toggle import cards /path/to/cards.tsv
./site-toggle import locations /path/to/locations.csv
./site-toggle import contexts /path/to/contexts.csv
./site-toggle import context-locations /path/to/context_locations.csv

# Optional durable timer daemon (re-blocks from DB expiries, survives restarts)
sudo -n ./site-toggle daemon status
sudo -n ./site-toggle daemon install
sudo -n ./site-toggle daemon uninstall
sudo -n ./site-toggle daemon tick
```

### Context / Location (Home vs Coworking)

Break Cards are filtered by **context** so you don’t get “home-only” suggestions while at coworking.

- Cards have `location` like: `any`, `indoor`, `outdoor`, `home`, `ruzafa`, `valencia`
- You set your current **context** to control which locations are eligible (defaults shipped in DB):
  - `home` → `any, indoor, outdoor, home, ruzafa, valencia`
  - `coworking` → `any, indoor, outdoor`

Commands:

```bash
./site-toggle context get
./site-toggle context set home
./site-toggle context set coworking
./site-toggle contexts
./site-toggle locations
```

Agent note (important):
- In `--json` mode, `break` and `suggest` require a context (or `--location`), otherwise you’ll get `ok:false` with `error_code:"CONTEXT_REQUIRED"`.

### Break Menu (machine-readable)

The `break` command is the agent-friendly “menu generator”:

```bash
./site-toggle break reddit --json
./site-toggle break reddit --minutes 10 --json   # override default minutes for the feed lane
```

It returns a single JSON object with:
- `event_key` (use this for `choose`)
- `lanes`: `same_need`, `physical`, `verb`, `noun`, `lesson`, `fusion` (if available), and `feed`

Then execute the chosen lane:

```bash
./site-toggle choose <event_key> physical --json  # no sudo
./site-toggle choose <event_key> verb --json      # no sudo
./site-toggle choose <event_key> noun --json      # no sudo
./site-toggle choose <event_key> lesson --json    # no sudo
./site-toggle choose <event_key> fusion --json    # no sudo
./site-toggle choose <event_key> same_need --json # no sudo
sudo -n ./site-toggle choose <event_key> feed --json  # requires sudo (edits /etc/hosts)
```

### Rating Break Cards

If Ryan doesn't like a suggested activity, he can rate it to affect future selection:

| Rating | Weight | Effect |
|--------|--------|--------|
| `love` | 2.0x | Shows up twice as often |
| `ok` | 1.0x | Normal frequency (default for unrated) |
| `meh` | 0.25x | Rarely shown |
| `ban` | 0.0x | **Never shown again** |

Example: After a card is served, the JSON includes `card.id`. If Ryan says "I don't like that one":
```bash
./site-toggle rate 42 ban
```

The card stays in the DB (can be un-banned later with `./site-toggle rate 42 ok`), but selection weight drops to zero.

### Import / Upload File Formats (CSV/TSV/JSON)

All imports are **additive upserts** (no deletes). Use these for later “upload/seed” workflows.

**Cards**
- JSON: array of objects with keys: `key, category, minutes, activity, done_condition, prompt, location, rarity, tags, active`
- CSV/TSV: header row with those columns
  - `tags`: `tag1|tag2|tag3` (or a JSON array string like `["tag1","tag2"]`)
  - `active`: `true/false/1/0/yes/no`
  - `prompt`: optional long text field (ready-to-copy AI prompt)

**Locations / Contexts**
- CSV/TSV: `slug,name`
- JSON: `{ slug, name }` (or array of those)

**Context-locations mapping**
- CSV/TSV: `context_slug,location_slug` (also accepts `context,location`)
- JSON: `{ context_slug, location_slug }` (also accepts `{ context, location }`)
- Context + location must exist first; missing slugs will error (keeps referential integrity strict).

### Cards with AI Prompts

Some cards include a `prompt` field: a ready-to-copy/paste AI prompt for practice (e.g., Spanish verb quizzing, exercise form, guided breathing).

**IMPORTANT: Show prompts in a card box below the menu** — don't hide them behind a selection. The prompt IS the value for learning cards.

When presenting a card that has `prompt`, use the box format:

```
┌─ Spanish Card (option 2) ─────────────────────────┐
│                                                   │
│  VERB (translation)                               │
│  Verb type · duration                             │
│                                                   │
│  Prompt:                                          │
│  The actual prompt text goes here...              │
│                                                   │
│  → "quiz me" or "2" to start                      │
└───────────────────────────────────────────────────┘
```

Structure:
- **Header**: Card type + option number
- **Title**: Word in caps + translation
- **Metadata**: Type/category · duration
- **Prompt:**: Clearly labeled interactive prompt
- **CTA**: How to activate

If Ryan says "quiz me" / "run it" / "start" / "2", use the prompt to drive the session directly in chat — become the tutor/coach.

See the full example response "When the card has a prompt" above.

### Site Name Mapping

Map natural language to script site IDs:
- x.com, twitter → `twitter`
- NYT, new york times → `nytimes`
- WSJ, wall street journal → `wsj`
- FT, financial times → `ft`
- WaPo → `washingtonpost`

---

## Offering Alternatives

When offering alternatives to unblocking, suggestions must be:
- **Timeboxed** (≤ 10 minutes)
- **Have a done-condition** (clear endpoint)
- **From different categories** (don't repeat the same type)

### Suggestion Bank

Pick from different categories. Rotate to stay fresh.

**Restorative (2-5 min)**
- Stand up, eyes off screen, slow breathing 4-6 count — done when timer ends
- Make tea or refill water — done when drink is made
- Step outside for 2 minutes of fresh air — done when you're back

**Physical (5-10 min)**
- 5-min mobility circuit (neck/shoulders/hips) — done at 5 minutes
- Quick walk to end of block and back — done when you return
- 20 pushups or squats — done when complete

**Creative (5-10 min)**
- Write 5 ugly sentences about what you're working on — done at 5 sentences
- Sketch the problem on paper with 3 labeled boxes — done when sketched
- Voice memo your current thinking for 2 minutes — done when recorded

**Intellectual (5-10 min)**
- Read one page of a book you've been meaning to read — done after 1 page
- Write 3 bullets: what I believe / what I need to know / what's next — done at 3 bullets
- Learn one new keyboard shortcut and practice it 5x — done when practiced

**Social (2-5 min)**
- Send one check-in text to a friend — done when sent
- Voice message someone for 60 seconds — done when sent
- Add one thing to your "people to reach out to" list — done when added

**Work momentum (5-10 min)**
- Pick the smallest next action on current task, do 5 minutes — done at timer
- Open the thing you're avoiding, write 3 TODO items — done at 3 items
- Ship one tiny thing (fix a typo, close an issue, send that email) — done when shipped

**Same-need substitutes (use based on site type)**
- **If news/business**: "Tell me the specific topic you're anxious about — I'll give you a 5-bullet 'what changed' brief without the feed."
- **If reddit/twitter**: "What are you hoping to find? I can propose 2 targeted searches or a direct next step that doesn't require scrolling."

---

## How It Works

1. **`/etc/hosts`** maps blocked domains to `127.0.0.1`
2. **SQLite DB** stores sites/domains, Break Cards, context/location mappings, and an events log (path: `~/Library/Application Support/Circuit Breaker/circuitbreaker.db`)
3. **LaunchDaemon (HTTP)** runs a Python HTTP server on port 80 serving `index.html` (label: `com.circuitbreaker`)
4. **Auto-reblock timers**
   - default: a per-unblock background timer process re-blocks after N minutes
   - optional: a LaunchDaemon can enforce re-blocking from DB expiries (label: `com.circuitbreaker.timers` via `site-toggle daemon install`)
5. **macOS notifications** alert when sites are re-blocked and when re-entry prompts fire

## Available Sites

Defined in `packages/core/src/seed/sites.ts` (`SITE_DEFINITIONS`), and seeded into the DB automatically:

**Social:** twitter, reddit
**News:** nytimes, cnn, bloomberg, wsj, cnbc, ft, marketwatch, businessinsider, reuters, theatlantic, washingtonpost, theguardian, bbc, npr, politico, axios, vox
**Tech:** techcrunch, theverge, wired, arstechnica

## Adding a New Site

Edit `packages/core/src/seed/sites.ts`:

1. Add an entry to `SITE_DEFINITIONS` with `slug`, `type`, `defaultMinutes`, and `domains`
2. Rebuild: `pnpm build`
3. Run `./site-toggle status` to confirm it appears
4. Run `sudo -n ./site-toggle off <slug>` to apply block entries into `/etc/hosts`

## Files

| File | Purpose |
|------|---------|
| `site-toggle` | Main script - manages blocking/unblocking |
| `index.html` | Block page shown when visiting blocked sites |
| `com.circuitbreaker.plist.template` | LaunchDaemon template (generate your plist from this) |
| `server.log` | HTTP server logs |
| `usage.log` | Unblock history for adaptive friction (TSV: timestamp, site, minutes) |
| `README.md` | User documentation |
| `claude.md` | Agent instructions (this file, for Claude/Codex) |
| `AGENTS.md` | Agent instructions (same content; used by some runners) |

## System Components

- **DB:** `~/Library/Application Support/Circuit Breaker/circuitbreaker.db`
- **LaunchDaemon (HTTP):** `/Library/LaunchDaemons/com.circuitbreaker.plist`
- **LaunchDaemon (timers, optional):** `/Library/LaunchDaemons/com.circuitbreaker.timers.plist` (installed via `site-toggle daemon install`)
- **Sudoers entry:** `/etc/sudoers.d/site-toggle` (passwordless sudo for `site-toggle`)
- **Hosts file:** `/etc/hosts` (contains blocked domain mappings)
- **Timer PIDs:** `/tmp/site-toggle-timers/` (default per-unblock timer processes)

## Troubleshooting

**Sites still accessible after blocking:**
```bash
sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder
```

**Check if HTTP server is running:**
```bash
curl http://127.0.0.1
```

**Restart HTTP server:**
```bash
sudo launchctl unload /Library/LaunchDaemons/com.circuitbreaker.plist
sudo launchctl load /Library/LaunchDaemons/com.circuitbreaker.plist
```

## Important Notes

- Default per-unblock timers do NOT survive system restarts (but blocking itself does)
- If you want “survives restart” behavior, install the optional daemon: `sudo -n ./site-toggle daemon install`
- HTTPS sites show certificate errors (this still blocks access)
- Does not affect local dev servers (they use different ports)
- The script has passwordless sudo configured, so Claude can run it directly
