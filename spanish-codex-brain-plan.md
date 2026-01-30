# Plan: Spanish Lessons in Web UI With a Codex “Brain” Session + Browser Mic Pronunciation (listen) + TTS (speak)

You want Spanish to be agent-driven (Codex runs the lesson logic) but UI-driven (buttons/answers/audio happen in the browser), and you want
the first iteration to support the full bundle (verb+noun+lesson+fusion) with browser mic pronunciation checking.

This plan is “decision complete”: an engineer can implement without guessing.

———

## 0) Key design choice (why this is the right split)

### Acting run-lines stays deterministic

- The acting scene engine must remain deterministic and low-latency: WS ack-driven playback, no “thinking” between each line.
- Codex is not in that loop.

### Spanish becomes “Brain + Tools”

Spanish is the perfect case for:

- Codex = pedagogy/decision-making
    - chooses questions
    - grades answers
    - adapts difficulty
    - decides what to say next
- Server = tool execution + state
    - runs TTS
    - runs pronunciation scoring
    - stores session history
    - streams events to UI

This prevents Codex from inventing tool output and gives you reproducible behavior.

———

## 1) UX: what the user sees in the browser (Spanish tab)

### 1.1 Entry points

The Break Menu “verb/noun/lesson/fusion” lane selection should offer:

- Start Spanish Session button
    - creates a Spanish session
    - attaches the chosen break card prompt
    - starts a Codex brain session behind the scenes
- After starting:
    - the UI shows Question 1
    - input box for the answer
    - Submit button
    - Record pronunciation button (if that question expects speech)

### 1.2 Session controls

- End session button (explicit completion, as you wanted)
- Pause (optional)
- Restart question (optional)

### 1.3 What text is displayed

- Show the question prompt (compact)
- Show the user’s submitted answer
- Show grading + correction
- Show a short feedback block (1–2 bullets) for pronunciation when used

———

## 2) Spanish session state machine (server-owned)

Even though Codex “drives all”, the server must own session invariants so we don’t regress into chaotic behavior.

### 2.1 Tables (in acting.db or a new spanish.db)

Recommend: use existing app DB directory, but keep separate logical tables in the existing DB used by UI server (you already have acting DB).

Add tables:

spanish_sessions

- id TEXT (uuid)
- created_at TEXT
- updated_at TEXT
- status TEXT (open|completed|abandoned)
- source TEXT (break_menu)
- event_key TEXT nullable (from break menu)
- lane TEXT (verb|noun|lesson|fusion)
- card_id INTEGER nullable
- card_key TEXT nullable
- card_prompt TEXT nullable
- codex_session_id TEXT nullable
- meta_json TEXT (json: selected voice, prefs, etc.)

spanish_turns

- id TEXT
- session_id TEXT
- idx INTEGER (turn counter)
- role TEXT (system|assistant|user|tool)
- content TEXT (user answer, assistant prompt, etc.)
- tool_name TEXT nullable (speak|listen|…)
- tool_json TEXT nullable (tool outputs)
- created_at TEXT

This makes sessions reviewable in UI and debuggable.

———

## 3) “Codex Brain” integration (server spawns Codex and keeps memory)

### 3.1 Why Codex runs on server (not client)

You want “same memory across button presses” and want Codex to run tools. The cleanest is:

- UI server spawns Codex CLI processes per turn, using codex exec resume <id> ...
- Server stores the codex_session_id in spanish_sessions

### 3.2 Commands

- First turn:
    - codex exec --json "<system instructions + initial context>"
- Next turns:
    - codex exec resume <codex_session_id> --json "<new user answer + constraints>"
- Sandbox: danger-full-access (as chosen)
- Working dir pinned: repo root.

### 3.3 Output handling

- Stream Codex JSONL events to UI over WS
- Persist to spanish_turns (for replay/debug)

———

## 4) Tool execution model (critical)

Codex “drives all”, but the server should execute tools via explicit API calls to avoid Codex making up tool output.

### 4.1 Define a “tool request” envelope that Codex must output

Codex responses must include structured tool requests like:

{
  "type": "tool_request",
  "tool": "speak",
  "args": { "text": "Quiero vincular...", "voice": "es-ES-AlvaroNeural", "rate": "-25%" }
}

or

{
  "type": "tool_request",
  "tool": "listen",
  "args": { "target_text": "Necesito cuatro agujas...", "attempt_audio_id": "upl_abc123" }
}

Server enforces:

- only allow specific tools
- runs the tool
- sends tool result back into Codex session as the next message

This is exactly how “agent + tools” systems stay grounded.

### 4.2 Allowed tools for Spanish (MVP)

- speak(text, voice, rate) → returns audio_id + duration; UI plays via /api/audio/:id
- listen(target_text, attempt_wav) → returns score + pass/fail + helpful phonetic bullets suggestion input (or raw score for Codex to
  interpret)

———

## 5) Browser mic pronunciation pipeline (your requirement)

You selected: Yes, browser mic.

### 5.1 Browser recording

- Implement in UI using Web Audio API (not MediaRecorder webm/opus).
- Record PCM in browser, encode to WAV 16kHz mono.
- Upload to server.

### 5.2 Server endpoint

Add action:

- spanish.listen.upload
    - input: { session_id, target_text, wav_bytes (multipart), question_idx }
    - server:
        - writes file to temp dir under App Support
        - calls existing python wav2vec2 pipeline (the same logic used by site-toggle listen, but adapted for file input)
        - returns score JSON

### 5.3 Output displayed

- Do NOT show IPA arrays to the user.
- UI shows:
    - short supportive line
    - 1–2 bullets using phonetic English (rules already in AGENTS/GEMINI/claude.md)

Codex can generate those bullets using the score info, but server ensures the “listen happened” and provides real score.

———

## 6) Session turn loop (how a question progresses)

For each question:

1. Server displays question text (from Codex)
2. User types answer in UI
3. UI sends spanish.session.answer action with answer
4. Server resumes Codex with the answer
5. Codex replies with:
    - grading
    - correction
    - next question
    - and optional tool requests (speak sentence, etc.)
6. Server executes tools, streams results, updates UI

If pronunciation is required:

- UI records audio → uploads WAV → server runs listen → injects result into Codex → Codex returns feedback + one retry option.

———

## 7) How this integrates with Break Menu

When you choose verb|noun|lesson|fusion:

- server returns breakChoice with card.prompt
- UI shows:
    - Start Spanish Session button
    - (optional) “Send to agent” still available for external runners, but not required now

On click:

- create session in DB with event_key, card_id, card_prompt
- start Codex brain with:
    - the card prompt
    - session rules (interactive, one question at a time, 15 Q max, etc.)
    - explicit tool protocol requirements

———

## 8) Guardrails (since we’re in danger-full-access)

Even though you chose maximum power, the server must enforce:

- token gate: X-CB-Token required for all brain actions
- pinned working dir
- allowlisted tool actions only (speak, listen, and maybe break.choose if needed)
- one active Codex process per Spanish session turn
- Cancel button kills the running Codex process

———

## 9) Files to implement (exact)

Server:

- packages/ui-server/src/server.ts
    - add spanish.session.start
    - add spanish.session.answer
    - add spanish.session.end
    - add spanish.listen.upload
    - add codex runner helpers (spawnCodexExec, spawnCodexResume)
- packages/ui-server/src/spanishDb.ts (new)
    - schema migrations for spanish_sessions, spanish_turns
- packages/ui-server/src/codexRunner.ts (new)
    - spawn, parse JSONL, extract codex session id, stream events
- packages/ui-server/src/listenServer.ts (new)
    - accept WAV file, run python phoneme model, return score JSON

UI:

- packages/ui/src/App.tsx (or new components)
    - add “Spanish” panel
    - add record button + WAV encoder + upload
    - show session transcript + current question
- packages/ui/src/api/client.ts
    - add typed helpers for Spanish actions
- packages/ui/src/ws/client.ts
    - add WS message types for Spanish streaming

Docs:

- Update AGENTS.md, GEMINI.md, claude.md with:
    - how Spanish is run from UI
    - what “end session” means
    - how mic is used in browser

———

## 10) Acceptance criteria (how we know it works)

- From Break Menu:
    - choose a verb card
    - click Start Spanish Session
    - UI shows Q1 immediately
- After each answer:
    - grading appears
    - TTS plays correct sentence
- Pronunciation:
    - record → server scores → UI shows 1–2 phonetic bullets + one retry
- Session memory:
    - the second question clearly depends on the first answer (proving Codex session memory is reused)
- End button:
    - ends the session and the next “Start Spanish Session” begins a fresh Codex session id
