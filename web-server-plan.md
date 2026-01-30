# Plan: Hoist Circuit Breaker (CLI → Local Web UI + Bun Server) With Full Parity + Browser Audio + Agent “Signals”

  ## 0) Goal & Success Criteria

  ### Goal

  Keep all existing core behaviors (break menu, choose flows, run-lines, speak/listen/play, stats, seed/import, etc.) but make the primary UI a
  local web app served by a Bun background server, controllable by:

  - a human via browser UI, and
  - an AI agent via explicit commands (“signals”) that appear in the UI (load scene, replay range, set speed, etc.).

  ### Success criteria (must be true)

  1. Server can be started/stopped via scripts/CLI, runs in background, and is local-only (127.0.0.1).
  2. Web UI can drive every major CLI action via strict curated APIs (no “run arbitrary CLI command” endpoint).
  3. Acting “run lines” plays audio in the browser (not afplay) with controls:
      - load script
      - choose range (from/to)
      - play/pause/stop
      - replay range
      - speed slower/faster (affects pause + TTS rate)
  4. Spanish listen can be used in the web UI using browser mic recording → server analysis → UI feedback.
  5. AI agent can send signals to the server via a CLI command, and the UI reflects them live.
  6. Existing site-toggle CLI continues to work as-is (terminal remains supported).

  ———

  ## 0.1) Reality Check (done): Bun + SQLite Compatibility

  We ran an actual spike on this machine (Bun `1.3.8`) against the real DB files in:

  - `/Users/ryanpfister/Library/Application Support/Circuit Breaker/circuitbreaker.db`
  - `/Users/ryanpfister/Library/Application Support/Circuit Breaker/acting.db`

  Findings:

  - Bun **cannot resolve** `node:sqlite` (`DatabaseSync`) in our environment:

    ```ts
    import { DatabaseSync } from "node:sqlite"; // FAILS in Bun: "Could not resolve: node:sqlite"
    ```

  - Bun **can** open/query both DBs using `bun:sqlite`:

    ```ts
    import { Database } from "bun:sqlite";
    const db = new Database("/Users/ryanpfister/Library/Application Support/Circuit Breaker/acting.db");
    db.query("SELECT name FROM sqlite_master LIMIT 1").get();
    db.close();
    ```

  Implication:

  - We can keep **SQLite** (no Postgres needed for this reason).
  - But a Bun web server **must not** depend on `node:sqlite` at import-time.
  - Shared code must target a tiny SQLite interface, with adapters for Node (CLI) and Bun (server).

  ## 1) Key Decisions (locked)

  - Scope: Local-only on 127.0.0.1
  - Lifecycle: Manual start/stop scripts (no LaunchAgent yet)
  - Backend runtime: Bun (Bun.serve) + WebSockets (per Bun docs)
  - Server framework: Hono (default)
      - Rationale: long-term maintainability (routing, middleware, structured error handling) as API surface grows.
      - Note: we can still use Bun-native WS under the hood; Hono just makes HTTP routing + middleware cleaner.
  - Database: SQLite (existing DB files under ~/Library/Application Support/Circuit Breaker/)
      - Bun server uses `bun:sqlite`
      - Node CLI can remain on `node:sqlite` (DatabaseSync), but shared packages must not import `node:sqlite` types
  - Frontend: Vite + React
  - Long-running / interactive: WebSocket sessions
  - Auth: No login/auth; localhost-only binding
      - However, privileged actions require a per-server capability token (anti-CSRF):
          - Server generates token at startup, stores it in `state.json`, returns it from `/api/status`
          - Browser includes `X-CB-Token` for any endpoint that can unblock sites / run `sudo -n` / mutate host blocking
  - API shape: Strict curated endpoints only (no generic “run CLI command” endpoint)
  - Port: Prefer high port 33291, but auto-pick a free high port if taken, and persist it for discovery.

  ———

  ## 1.1) Consultant Notes (updated after spike)

  - Consultant1’s “SQLite mismatch” warning is correct, and our spike confirms it: the Bun server can’t reuse our current `node:sqlite`
    imports as-is. The mitigation is **SQLite + adapters**, not Postgres.
  - Consultant1’s “ack-driven WebSocket sessions” is correct: browser audio playback must be the clock (client ACK on audio ended) to avoid drift.
  - Consultant1’s “localhost still needs CSRF protection for privileged endpoints” is correct: a malicious webpage can hit `127.0.0.1` from the
    browser. We must add a token gate for `sudo`/blocking endpoints.
  - Consultant1’s audio format guidance is strong: prefer browser-generated 16k mono WAV; keep server resample as fallback.
  - Consultant2’s “Bun supports `node:sqlite` sufficiently” does not match our tested reality in this environment, so we should not plan around it.
  - Hono vs raw Bun router: choose Hono as the default foundation. We expect the UI server to grow a lot (action registry, uploads, auth/token
    gates, logging), and Hono provides cleaner routing + middleware composition long-term.

  ## 2) Architecture Overview

  ### Components

  0. packages/shared-sqlite (new)
     A tiny, intentionally-minimal DB interface used by shared code so it can run in both Node (CLI) and Bun (ui-server):

     - Node adapter wraps `node:sqlite` `DatabaseSync`
     - Bun adapter wraps `bun:sqlite` `Database`

     This lets `packages/core` + `packages/runtime` avoid importing `node:sqlite` types.

  1. packages/runtime (new shared library)
     A new internal package that contains the reusable logic currently embedded in CLI commands, refactored into callable functions:
      - TTS rendering (Edge TTS)
      - Acting script DB + parsing/sanitization + session event generator (non-afplay)
      - “play” MIDI→WAV generation (no afplay)
      - “listen” analysis pipeline that accepts an uploaded audio file (no sox -d)
      - Utility: durable cache paths, content-type helpers, etc.
  2. packages/ui-server (new Bun server)
      - Serves static frontend build (packages/ui/dist)
      - Uses Hono for routing/middleware (request ID, JSON helpers, capability token gate)
      - Provides HTTP JSON APIs for “instant” operations (break, list scripts, etc.)
      - Provides WebSocket for session streaming + control (run-lines playback, long ops)
      - Exposes an “agent signal” endpoint and broadcasts signals to UI clients
  3. packages/ui (new Vite + React frontend)
      - Views for: Break menu, Run Lines, Spanish Listen, SOVT/Play, Logs/Signals
      - Uses HTTP APIs + WebSocket to drive server and receive updates
      - Plays audio in browser using <audio>/WebAudio
  4. site-toggle ui ... (CLI additions)
     A thin CLI wrapper that starts/stops the Bun server and can send signals:
      - site-toggle ui start
      - site-toggle ui stop
      - site-toggle ui status
      - site-toggle ui open
      - site-toggle ui signal ...

  ———

  ## 3) Process & State Management (Start/Stop)

  ### State directory

  Use: ~/Library/Application Support/Circuit Breaker/ui-server/

  Files:

  - state.json (authoritative runtime state)
      - pid
      - port
      - started_at
      - log_path
      - ui_url (e.g. http://127.0.0.1:33291/)
      - ws_url (e.g. ws://127.0.0.1:33291/ws)
  - server.log (append-only stdout/stderr)

  ### Port strategy

  - Attempt to bind 127.0.0.1:33291.
  - If unavailable, scan random ports in [32000..65535] up to N attempts (e.g. 50).
  - Persist the chosen port to state.json.

  ### Background execution

  site-toggle ui start spawns the Bun server detached:

  - bun run packages/ui-server/src/server.ts --port <chosen>
  - Writes PID + port to state.json
  - Redirect logs to server.log

  site-toggle ui stop:

  - Reads pid from state.json
  - Sends SIGTERM, waits briefly, then SIGKILL if needed
  - Cleans up state.json (or marks stopped)

  ———

  ## 4) API Design (Strict Curated)

  ### Conventions

  - HTTP endpoints return { ok: boolean, ... } JSON.
  - All endpoints are local-only.
  - Privileged endpoints (anything that can call `sudo -n` / unblock sites / edit /etc/hosts) require a capability token:
      - **Require token for all state-changing requests** (POST/PUT/PATCH/DELETE), regardless of Origin.
          - This avoids relying on browser-specific Origin header behavior (forms, images, redirects).
      - Token source:
          - Server generates a random token at startup.
          - Server persists token in `~/Library/Application Support/Circuit Breaker/ui-server/state.json`.
          - Browser obtains token from `/api/status` and sends it back as `X-CB-Token`.
          - CLI/agent commands read token from `state.json` and include it on requests.
      - Read-only GET endpoints do not require token.
  - WebSocket is used for:
      - streaming logs/events
      - interactive sessions (run-lines playback)
      - agent signals broadcast

  ### Route strategy (single mental model)

  To avoid drifting into two competing API styles, the server uses:

  **Infrastructure routes (small, fixed set)**

  - `GET /api/status` (health + token discovery)
  - `GET /api/capabilities` (discoverable action registry; helps UI/agents)
  - `GET /api/audio/:audio_id` (byte streaming for cached audio)
  - `GET /ws` (WebSocket upgrade)

  **Everything else goes through the action registry**

  - `POST /api/action` with `{ v: 1, action, payload }`
      - Examples:
          - `action: "break.menu"`
          - `action: "break.choose"`
          - `action: "acting.import"`
          - `action: "run_lines.start"`
          - `action: "tts.speak"`
          - `action: "listen.analyze"`
          - `action: "play.render"`

  Rationale:

  - Keeps “strict curated” while preventing route sprawl.
  - Centralizes validation + token checks + sudo allowlisting.

  ### Privilege tiers (what must be token-gated vs not)

  This is the minimal explicit split to keep the system safe without over-engineering:

  **Tier 0 — Read-only (no token required)**

  - `GET /api/status`
  - `GET /api/capabilities`
  - `GET /api/audio/:audio_id`
  - `GET /api/agent/signals` (read-only view of in-memory log)

  **Tier 1 — State-changing but non-privileged (token required; no sudo)**

  - `POST /api/action` for any Tier 1 action (writes DB, session state, caches, temp files)

  **Tier 2 — Privileged (token required + sudo policy)**

  These are the only endpoints/actions that are allowed to call `sudo -n`:

  - still routed through `POST /api/action`, but with `requiresSudo: true` and an explicit allowlist:
      - `action: "hosts.on"` (calls `sudo -n ./site-toggle on <site> <minutes>`)
      - `action: "hosts.off"` (calls `sudo -n ./site-toggle off <site>`)
      - `action: "break.choose_feed"` (calls `sudo -n ./site-toggle choose <event_key> feed --json`)
      - `action: "daemon.install"|"daemon.uninstall"|"daemon.tick"` (if/when exposed in UI)

  Enforcement mechanism:

  - Every action handler must declare:
      - `requiresToken: boolean`
      - `requiresSudo: boolean`
  - The action registry enforces token first, then enforces sudo allowlist.

  ### Prefer an Action Registry (keeps “strict curated” without endless routes)

  We can keep a few “simple” endpoints like `/api/status` and `/api/audio/:id`, but for most operations prefer a single RPC-ish route:

  - POST `/api/action`
      - body: `{ v: 1, action: string, payload: object }`
      - server has a hardcoded registry:
          - allowed action names
          - payload schema validation (Zod recommended)
          - privilege policy (requires token? requires sudo? read-only?)

  Add:

  - GET `/api/capabilities`
      - returns `{ ok:true, v:1, actions:[{ action, schema_version, requires_token, description }] }`

  ### HTTP Endpoints (non-exhaustive but “full parity” by mapping each CLI domain)

  Core / Site Blocker

  - GET /api/status → mirrors site-toggle status --json
  - POST /api/on body { site: string, minutes: number } → mirrors sudo -n site-toggle on <site> <minutes>
  - POST /api/off body { site: string } → mirrors sudo -n site-toggle off <site>
  - GET /api/stats → mirrors site-toggle stats --json
  - POST /api/seed → mirrors site-toggle seed --json
  - POST /api/break body { site: string, minutes?: number, context?: string, location?: string } → mirrors site-toggle break ... --json
  - POST /api/choose body { event_key: string, lane: string }
      - If lane requires sudo (feed), server runs sudo -n site-toggle choose <event_key> feed --json

  Modules

  - GET /api/modules
  - POST /api/module/:slug/history
  - POST /api/module/:slug/start
  - POST /api/module/:slug/complete
  - POST /api/module/:slug/test / test-complete (Spanish)

  Acting (Run Lines)

  - GET /api/run-lines/scripts
  - POST /api/run-lines/import
  - GET /api/run-lines/scripts/:id
  - GET /api/run-lines/scripts/:id/characters
  - POST /api/run-lines/scripts/:id/characters/:name/voice
  - GET /api/run-lines/scripts/:id/lines?from=&to=
  - POST /api/run-lines/scripts/:id/patch (drop-range, merge, set-speaker, set-type, replace-text)
  - POST /api/run-lines/session/start (creates WS session id; returns {session_id})
  - POST /api/run-lines/session/stop (stop a running session)

  TTS + Audio

  - POST /api/tts/speak body { text, voice, rate } → returns { audio_id, duration_sec }
  - GET /api/audio/:audio_id → streams audio bytes with correct content-type

  Listen (Spanish pronunciation)

  - POST /api/listen/reference body { text, voice } → returns { ref_audio_id } (server-generated via Edge TTS)
  - POST /api/listen/analyze multipart:
      - attempt_audio (webm/wav/mp3)
      - reference_text or ref_audio_id
      - returns { score, ref, attempt, pass } similar shape to CLI JSON, but without requiring local mic capture

  Play (SOVT / Musical)

  - POST /api/play/render body { kind, args... } → returns { audio_id } (render-only; browser plays)

  ———

  ## 5) WebSocket Protocol (Sessions + Signals)

  ### WebSocket endpoint

  - GET /ws upgrades to WebSocket (server.upgrade(req) pattern per Bun docs)

  ### Client identification

  - No auth; client sends a hello message on connect:
      - { type: "hello", client_id: "<uuid>" }

  ### Message types (client → server)

  - run_lines.start:
      - { type: "run_lines.start", script_id, from, to, mode, me?, read_all, pause_mult, cue_words, reveal_after, speed_mult }
  - run_lines.pause / run_lines.resume / run_lines.stop
  - run_lines.seek:
      - { type: "run_lines.seek", from, to }
  - run_lines.set_speed:
      - { type: "run_lines.set_speed", speed_mult }
  - agent.signal (optional over WS, but primary is HTTP/CLI):
      - { type: "agent.signal", name, payload }

  ### Message types (server → client)

  - server.state:
      - { type: "server.state", now, port, ui_url }
  - run_lines.event (stream of events):
      - directions: { type:"run_lines.event", event:"direction", idx, text }
      - dialogue: { type:"run_lines.event", event:"line", idx, speaker, text, audio_id, duration_sec }
      - pause: { type:"run_lines.event", event:"pause", idx, duration_sec }
      - progress: { type:"run_lines.event", event:"progress", idx }
  - agent.signal broadcast:
      - { type:"agent.signal", name, payload, created_at }
  - error:
      - { type:"error", scope, message }

  ———

  ## 6) Refactors Required to Support Browser Audio (Runtime Package)

  ### Create packages/shared-sqlite (new)

  Goal: keep SQLite, but make shared code compatible with both Node and Bun by depending on a tiny interface instead of `node:sqlite` types.

  Create:

  - `packages/shared-sqlite/src/types.ts`
  - `packages/shared-sqlite/src/nodeDatabaseSyncAdapter.ts`
  - `packages/shared-sqlite/src/bunDatabaseAdapter.ts`
  - `packages/shared-sqlite/src/index.ts` (exports)

  Interface (keep intentionally minimal; don’t bake in driver-specific result types):

  ```ts
  export interface SqliteStmt {
    get(...args: any[]): any;
    all(...args: any[]): any[];
    run(...args: any[]): any;
  }

  export interface SqliteDb {
    exec(sql: string): void;
    prepare(sql: string): SqliteStmt;
    close(): void;
  }
  ```

  Refactor required (because we currently import `DatabaseSync` types in shared packages):

  - Replace `import type { DatabaseSync } from "node:sqlite"` with `import type { SqliteDb } from "@circuit-breaker/shared-sqlite"`
  - Update function signatures in:
      - `packages/core/src/db/*`
      - `packages/core/src/engine/*`
      - `packages/core/src/seed/*`
    to accept `SqliteDb`.

  Move DB-open logic out of shared packages:

  - `packages/core/src/db/index.ts` currently imports `DatabaseSync` and must become “driver-agnostic”.
  - Plan:
      - Change `packages/core/src/db/index.ts` to export only pure helpers that accept `SqliteDb` (applySchema, seed, queries).
      - Create Node-only openers in CLI (still using `DatabaseSync`):
          - `packages/cli/src/db/openCoreDbNode.ts`
          - `packages/cli/src/acting/openActingDbNode.ts`
      - Create Bun-only openers in server (using `bun:sqlite`):
          - `packages/ui-server/src/db/openCoreDbBun.ts`
          - `packages/ui-server/src/db/openActingDbBun.ts`

  ### Create packages/runtime (new)

  Add:

  - packages/runtime/package.json (workspace package)
  - packages/runtime/tsconfig.json
  - packages/runtime/src/index.ts exports public runtime APIs for server/CLI

  #### 6.1 TTS rendering

  Move/centralize from packages/cli/src/tts/edgeTts.ts:

  - Export:
    renderTts(params: { text: string; voice: string; rate: string; cacheDir?: string }): { mp3Path: string; durationSec: number }
  - Add helper to return stable audio_id and map audio_id → file path:
      - getAudioIdForMp3Path(mp3Path): string
      - resolveAudioPath(audio_id): string

  #### 6.2 Acting session generator (no afplay)

  Refactor packages/cli/src/acting/session.ts into runtime:

  - Split into:
      - generateRunLinesEvents(...) async generator yielding:
          - direction events
          - line events with audio_id
          - pause events
      - CLI version consumes generator and plays via afplay.
      - UI-server version consumes generator and sends events via WS, browser plays audio.

  #### 6.3 “play” render-only output

  Refactor packages/cli/src/commands/play.ts:

  - Separate “render wav” from “afplay wav”.
  - Export:
    renderPlayAudio(params): { wavPath: string; durationSec: number }
  - Server uses wavPath → audio_id and streams bytes; CLI continues to optionally afplay.

  #### 6.4 Listen analyze with uploaded audio

  Refactor cmdListen:

  - Extract reusable functions into runtime:
      - buildReferenceAudioFromText(text, voice): { mp3Path, wavPath, phones }
      - analyzeAttemptAudio(attemptWavPath, refPhones): { attemptPhones, score }
  - Add conversion function:
      - convertTo16kMonoWav(inputPath) -> wavPath using sox
  - UI flow:
      - Preferred: browser records audio as **16kHz mono WAV (PCM16)** and uploads it
      - Server verifies and resamples with sox as needed, analyzes, returns JSON
      - Fallback: if browser can only upload webm/opus, treat ffmpeg as an optional extra dependency (not required for Phase 1)

  ———

  ## 7) UI (Vite + React) Requirements

  ### Pages

  1. Home / Status
      - Server running indicator
      - Links to features
  2. Break Menu
      - Choose site + minutes + context
      - Render lanes; choosing lane triggers /api/choose
  3. Run Lines
      - Recent scripts list (from /api/run-lines/scripts)
      - Load script → show characters + voice assignment UI
      - Range selector (from/to)
      - Session controls: play/pause/stop/replay slower/faster
      - Live transcript + highlight current line
  4. Listen (Spanish)
      - Input reference text
      - Record attempt in browser
      - Show result JSON summary + “phonetic English spelling” feedback guidance (the agent will still phrase it, but UI shows structured
        score)
  5. Signals / Activity Log
      - Shows incoming agent signals + server events

  ### Frontend dev/prod setup

  - Vite dev server on 5173, proxy /api and /ws to Bun backend port.
  - Prod build to packages/ui/dist.
  - Bun serves dist/index.html and static assets.

  ———

  ## 8) “AI Agent Signals” (CLI → Server → UI)

  ### CLI additions

  Add to packages/cli/src/index.ts a new command group: ui.

  Subcommands:

  - site-toggle ui start [--port 33291] [--json]
  - site-toggle ui stop [--json]
  - site-toggle ui status [--json]
  - site-toggle ui open
  - site-toggle ui signal <name> [--json <payload>]
    Sends HTTP POST to http://127.0.0.1:<port>/api/agent/signal with:
      - { name, payload, created_at }

  ### Server handling

  - POST /api/agent/signal stores an in-memory ring buffer (last N signals, e.g. 200) and broadcasts on WS to all clients.
  - UI shows signals, and some signals can drive UI state:
      - load_scene { script_id, from, to }
      - replay_range { from, to }
      - set_speed { speed_mult }

  ———

  ## 9) Repo Changes (Decision-Complete File List)

  ### New packages

  - packages/shared-sqlite/**
  - packages/runtime/**
  - packages/ui-server/**
  - packages/ui/**

  ### Modify existing

  - packages/cli/src/index.ts (add ui command group)
  - packages/cli/src/acting/session.ts (refactor to runtime-backed)
  - packages/cli/src/commands/play.ts (split render vs play)
  - packages/cli/src/index.ts listen logic refactor to runtime
  - AGENTS.md, GEMINI.md, claude.md (add UI server usage + agent signal instructions)

  ### Root scripts

  - package.json add scripts:
      - ui:dev (bun server + vite dev)
      - ui:build (vite build + bun build if needed)
      - ui:server (run bun server)
  - Add shell scripts (repo root or scripts/):
      - scripts/ui-start
      - scripts/ui-stop
      - scripts/ui-open
        (These call site-toggle ui ... so there’s one source of truth.)

  ———

  ## 9.1) Appendix: Patch Skeletons (git diff format)

  These are reference snippets to make implementation “decision-complete”. They are not meant to be copy/paste perfect,
  but they capture the shape we should converge on.

  ### A) `packages/shared-sqlite` (new)

  ```diff
  diff --git a/packages/shared-sqlite/package.json b/packages/shared-sqlite/package.json
  new file mode 100644
  index 0000000..1111111
  --- /dev/null
  +++ b/packages/shared-sqlite/package.json
  @@
  +{
  +  "name": "@circuit-breaker/shared-sqlite",
  +  "private": true,
  +  "version": "0.0.0",
  +  "type": "module",
  +  "exports": {
  +    ".": "./src/index.ts"
  +  }
  +}
  diff --git a/packages/shared-sqlite/src/types.ts b/packages/shared-sqlite/src/types.ts
  new file mode 100644
  index 0000000..2222222
  --- /dev/null
  +++ b/packages/shared-sqlite/src/types.ts
  @@
  +export interface SqliteStmt {
  +  get(...args: any[]): any;
  +  all(...args: any[]): any[];
  +  run(...args: any[]): any;
  +}
  +
  +export interface SqliteDb {
  +  exec(sql: string): void;
  +  prepare(sql: string): SqliteStmt;
  +  close(): void;
  +}
  diff --git a/packages/shared-sqlite/src/bunDatabaseAdapter.ts b/packages/shared-sqlite/src/bunDatabaseAdapter.ts
  new file mode 100644
  index 0000000..3333333
  --- /dev/null
  +++ b/packages/shared-sqlite/src/bunDatabaseAdapter.ts
  @@
  +import type { Database } from "bun:sqlite";
  +import type { SqliteDb, SqliteStmt } from "./types";
  +
  +export function bunDbAdapter(db: Database): SqliteDb {
  +  return {
  +    exec(sql: string) {
  +      db.exec(sql);
  +    },
  +    prepare(sql: string): SqliteStmt {
  +      // Bun uses `query()` to return a prepared statement-like object
  +      return db.query(sql) as unknown as SqliteStmt;
  +    },
  +    close() {
  +      db.close();
  +    }
  +  };
  +}
  diff --git a/packages/shared-sqlite/src/nodeDatabaseSyncAdapter.ts b/packages/shared-sqlite/src/nodeDatabaseSyncAdapter.ts
  new file mode 100644
  index 0000000..4444444
  --- /dev/null
  +++ b/packages/shared-sqlite/src/nodeDatabaseSyncAdapter.ts
  @@
  +import type { DatabaseSync } from "node:sqlite";
  +import type { SqliteDb, SqliteStmt } from "./types";
  +
  +export function nodeDbAdapter(db: DatabaseSync): SqliteDb {
  +  return {
  +    exec(sql: string) {
  +      db.exec(sql);
  +    },
  +    prepare(sql: string): SqliteStmt {
  +      return db.prepare(sql) as unknown as SqliteStmt;
  +    },
  +    close() {
  +      db.close();
  +    }
  +  };
  +}
  diff --git a/packages/shared-sqlite/src/index.ts b/packages/shared-sqlite/src/index.ts
  new file mode 100644
  index 0000000..5555555
  --- /dev/null
  +++ b/packages/shared-sqlite/src/index.ts
  @@
  +export type { SqliteDb, SqliteStmt } from "./types";
  +export { bunDbAdapter } from "./bunDatabaseAdapter";
  +export { nodeDbAdapter } from "./nodeDatabaseSyncAdapter";
  ```

  ### B) Example shared refactor: remove `DatabaseSync` types from core

  ```diff
  diff --git a/packages/core/src/db/schema.ts b/packages/core/src/db/schema.ts
  index 1234567..89abcde 100644
  --- a/packages/core/src/db/schema.ts
  +++ b/packages/core/src/db/schema.ts
  @@
  -import type { DatabaseSync } from "node:sqlite";
  +import type { SqliteDb } from "@circuit-breaker/shared-sqlite";
  @@
  -export function applySchema(db: DatabaseSync): void {
  +export function applySchema(db: SqliteDb): void {
     db.exec(`CREATE TABLE IF NOT EXISTS ...`);
   }
  ```

  ### C) Security gate sketch: capability token for privileged endpoints

  ```diff
  diff --git a/packages/ui-server/src/server.ts b/packages/ui-server/src/server.ts
  @@
  +function requireTokenIfBrowser(req: Request, token: string): Response | null {
  +  const origin = req.headers.get("origin");
  +  if (!origin) return null; // CLI/curl
  +  const got = req.headers.get("x-cb-token");
  +  if (!got || got !== token) return json({ ok:false, error:"missing_or_bad_token" }, { status: 403 });
  +  return null;
  +}
  ```

  ### D) Hono server skeleton + action registry (recommended baseline)

  The consultants provided usable code patterns for:

  - strict curated actions via an “action registry”
  - ack-driven WebSocket sessions
  - serving audio by ID via HTTP (not WS)

  The main adjustments we make (based on our spike + repo constraints):

  - use `bun:sqlite` (not `node:sqlite`) inside the Bun server
  - use Hono for HTTP routing + middleware
  - gate all state-changing endpoints with `X-CB-Token`

  ```diff
  diff --git a/packages/ui-server/src/server.ts b/packages/ui-server/src/server.ts
  new file mode 100644
  index 0000000..6666666
  --- /dev/null
  +++ b/packages/ui-server/src/server.ts
  @@
  +import crypto from "node:crypto";
  +import { Hono } from "hono";
  +import { serveStatic } from "hono/bun";
  +import { z } from "zod";
  +
  +type ActionContext = {
  +  token: string;
  +};
  +
  +function makeToken(): string {
  +  return crypto.randomBytes(16).toString("hex");
  +}
  +
  +function requireToken(c: any, ctx: ActionContext): Response | null {
  +  const got = c.req.header("x-cb-token");
  +  if (!got || got !== ctx.token) {
  +    return c.json({ ok: false, error: "missing_or_bad_token" }, 403);
  +  }
  +  return null;
  +}
  +
  +const ActionEnvelopeV1 = z.object({
  +  v: z.literal(1),
  +  action: z.string().min(1),
  +  payload: z.unknown()
  +});
  +
  +type ActionHandler = (args: { ctx: ActionContext; payload: any }) => Promise<any>;
  +
  +const actions: Record<string, { requiresToken: boolean; schema: z.ZodTypeAny; handler: ActionHandler }> = {
  +  "agent.signal": {
  +    requiresToken: true,
  +    schema: z.object({ name: z.string().min(1), payload: z.unknown().optional() }),
  +    async handler({ payload }) {
  +      return { ok: true, signal: { name: payload.name, payload: payload.payload ?? null } };
  +    }
  +  }
  +  // Add: acting.import, run_lines.start, tts.speak, listen.analyze, ...
  +};
  +
  +export function createApp(): Hono {
  +  const app = new Hono();
  +  const ctx: ActionContext = { token: makeToken() };
  +
  +  app.get("/api/status", (c) =>
  +    c.json({
  +      ok: true,
  +      token: ctx.token
  +    })
  +  );
  +
  +  app.get("/api/capabilities", (c) =>
  +    c.json({
  +      ok: true,
  +      v: 1,
  +      actions: Object.entries(actions).map(([action, info]) => ({
  +        action,
  +        requires_token: info.requiresToken
  +      }))
  +    })
  +  );
  +
  +  app.post("/api/action", async (c) => {
  +    const parsed = ActionEnvelopeV1.safeParse(await c.req.json().catch(() => null));
  +    if (!parsed.success) return c.json({ ok: false, error: "invalid_request" }, 400);
  +
  +    const { action, payload } = parsed.data;
  +    const entry = actions[action];
  +    if (!entry) return c.json({ ok: false, error: "unknown_action", action }, 404);
  +
  +    if (entry.requiresToken) {
  +      const bad = requireToken(c, ctx);
  +      if (bad) return bad;
  +    }
  +
  +    const payloadParsed = entry.schema.safeParse(payload);
  +    if (!payloadParsed.success) return c.json({ ok: false, error: "invalid_payload" }, 400);
  +
  +    const result = await entry.handler({ ctx, payload: payloadParsed.data });
  +    return c.json(result);
  +  });
  +
  +  // Prod UI static serving
  +  app.use("/*", serveStatic({ root: "packages/ui/dist" }));
  +
  +  return app;
  +}
  ```

  Notes:

  - This section deliberately “leans into” the consultants’ best advice (action registry + schema validation) while keeping it compatible with
    our Bun+SQLite reality (server uses `bun:sqlite`, shared code uses adapters).
  - WebSocket and run-lines ACK protocol remain as specified in section 5; we keep audio delivery as `GET /api/audio/:id` and send IDs/URLs
    over WS (do not stream binary over WS).

  ## 10) Testing & Acceptance

  ### Unit/integration tests (add)

  - packages/runtime tests:
      - TTS cache key stability (same params → same audio_id)
      - run-lines generator yields correct event sequence (no speaker labels in spoken text)
      - play render returns a non-empty wav
      - listen analyze works with an input fixture wav
  - packages/ui-server tests:
      - /api/status returns ok
      - /api/run-lines/scripts returns seeded scripts
      - WS session start streams run_lines.event messages
      - /api/audio/:id returns correct content-type and bytes

  ### Manual acceptance script (documented)

  - Start server: site-toggle ui start
  - Open UI: site-toggle ui open
  - Load Scene 5, range 1..40, play in browser (no afplay)
  - Record Spanish listen attempt in browser and get analysis JSON
  - Agent signal: site-toggle ui signal load_scene --json '{"script_id":2,"from":1,"to":40}' and confirm UI updates

  ———

  ## 11) Documentation Updates (AGENTS.md / GEMINI.md / claude.md)

  Add a new “Web UI” section with:

  - How to start/stop/open
  - How agent signals work
  - How to map “terminal workflows” to UI workflows
  - Explicit note: local-only, no auth, intended for single-user Mac

  ———

  ## 12) Rollout Strategy (Phased Implementation, but still Full-Parity Target)

  ### Phase 1: Skeleton + Serving + Status

  - Add ui-server + ui packages
  - Start/stop scripts, port file
  - Basic /api/status and WS connectivity

  ### Phase 2: Acting in Browser (Run Lines)

  - Runtime run-lines event generator
  - UI transcript + audio playback
  - Range controls + speed

  ### Phase 3: Spanish Listen in Browser

  - Browser recording + server analysis
  - UI for results

  ### Phase 4: Remaining CLI Parity via Curated Endpoints

  - break/choose/on/off/stats/modules/sovt/play endpoints
  - UI pages for each domain

  ———

  ## Assumptions (explicit)

  - User machine has Bun installed and available on PATH.
  - Localhost-only is sufficient security for non-privileged operations, but privileged endpoints must be gated by a capability token (anti-CSRF).
  - Browser playback is acceptable latency-wise with Edge TTS caching; initial runs may have some delay.
  - Any command requiring sudo (block/unblock/feed) relies on existing passwordless sudo setup.
