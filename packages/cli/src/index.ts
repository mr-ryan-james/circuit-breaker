import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { spawn } from "node:child_process";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";

import {
  ALL_SITE_SLUGS,
  HOSTS_FILE_PATH,
  TIMER_DIR_PATH,
  blockDomains,
  startTimer,
  isDomainBlocked,
  buildBreakMenu,
  countDueSrsCards,
  countSrsCards,
  findMostRecentOpenBreakEventKey,
  flushDns,
  getAllSites,
  getBreakServedEvent,
  getContextLocations,
  getDomainsForSiteId,
  getCompletedSpanishVerbCards,
  getSetting,
  getSiteBySlug,
  getSitesWithExpiredUnblocks,
  getTimerStatus,
  importCardsFromFile,
  importContextLocationsFromFile,
  importContextsFromFile,
  importLocationsFromFile,
  insertEvent,
  killTimer,
  linkContextLocation,
  loadModulesFromDir,
  listContexts,
  listLocations,
  addContext,
  addLocation,
  moduleMatchesTags,
  readHostsFile,
  resolveDbPath,
  seedCardsFromDir,
  selectBreakCards,
  setSetting,
  setCardRating,
  setSiteUnblockedUntil,
  unlinkContextLocation,
  unblockDomains,
  listDueSrsCards,
  writeHostsFile,
} from "@circuit-breaker/core";

import type { ModuleDefinition } from "@circuit-breaker/core";
import { openDb } from "./db/openDb.js";
import { cmdPlay } from "./commands/play.js";
import { cmdRunLines } from "./acting/cli.js";
import { openActingDb } from "./acting/db.js";
import { renderTts } from "./tts/edgeTts.js";

class CliError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function repoRootFromHere(): string {
  const distDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(distDir, "../../..");
}

function modulesDirPath(): string {
  return path.join(repoRootFromHere(), "data", "modules");
}

function loadModules(): ModuleDefinition[] {
  return loadModulesFromDir(modulesDirPath());
}

function findModuleOrThrow(slug: string): ModuleDefinition {
  const modules = loadModules();
  const found = modules.find((m) => m.slug === slug) ?? null;
  if (found) return found;

  const available = modules.map((m) => m.slug).sort();
  const suffix = available.length > 0 ? ` Available: ${available.join(", ")}` : " No modules are defined.";
  throw new Error(`Unknown module: ${slug}.${suffix}`);
}

function parseTagsJson(tagsJson: string): string[] {
  try {
    const parsed = JSON.parse(tagsJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(String).map((t) => t.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function cardsDirPath(): string {
  return path.join(repoRootFromHere(), "data", "cards");
}

type DeckCardAudit = {
  file: string;
  key: string | null;
  category: string | null;
  minutes: number | null;
  activity: string | null;
  active: boolean | null;
  tags: string[];
};

function auditDeckFromDir(dirPath: string): {
  files_scanned: number;
  cards_scanned: number;
  errors: Array<{ file: string; error: string }>;
  duplicates: Array<{ key: string; count: number; files: string[] }>;
  spanish_orphans: Array<{ file: string; key: string; tags: string[] }>;
  inactive: Array<{ file: string; key: string; activity: string | null }>;
  stats: {
    total: number;
    active: number;
    inactive: number;
    by_category: Record<string, number>;
    tag_counts_top: Array<{ tag: string; count: number }>;
  };
} {
  const errors: Array<{ file: string; error: string }> = [];
  const cards: DeckCardAudit[] = [];

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const jsonFiles = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".json"))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  for (const filename of jsonFiles) {
    const fullPath = path.join(dirPath, filename);
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ file: filename, error: `bad_json: ${msg}` });
      continue;
    }

    if (!Array.isArray(parsed)) {
      errors.push({ file: filename, error: "unsupported_json_shape (expected array)" });
      continue;
    }

    for (const raw of parsed) {
      if (typeof raw !== "object" || raw === null) continue;
      const rec = raw as any;
      const key = typeof rec.key === "string" && rec.key.trim() ? rec.key.trim() : null;
      const category = typeof rec.category === "string" && rec.category.trim() ? rec.category.trim() : null;
      const minutes = typeof rec.minutes === "number" && Number.isFinite(rec.minutes) ? rec.minutes : null;
      const activity = typeof rec.activity === "string" && rec.activity.trim() ? rec.activity.trim() : null;
      const active = typeof rec.active === "boolean" ? rec.active : null;
      const tags = Array.isArray(rec.tags) ? rec.tags.map(String).map((t: string) => t.trim()).filter(Boolean) : [];
      cards.push({ file: filename, key, category, minutes, activity, active, tags });
    }
  }

  const byKey = new Map<string, Set<string>>();
  for (const c of cards) {
    if (!c.key) continue;
    const set = byKey.get(c.key) ?? new Set<string>();
    set.add(c.file);
    byKey.set(c.key, set);
  }
  const duplicates = Array.from(byKey.entries())
    .filter(([, files]) => files.size > 1)
    .map(([key, files]) => ({ key, count: files.size, files: Array.from(files.values()).sort() }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  const spanishLaneTags = new Set(["verb", "noun", "lesson", "fusion"]);
  const spanishOrphans: Array<{ file: string; key: string; tags: string[] }> = [];
  for (const c of cards) {
    if (!c.key) continue;
    if (!c.tags.includes("spanish")) continue;
    const hasLane = c.tags.some((t) => spanishLaneTags.has(t));
    if (!hasLane) spanishOrphans.push({ file: c.file, key: c.key, tags: c.tags });
  }

  const inactive: Array<{ file: string; key: string; activity: string | null }> = [];
  for (const c of cards) {
    if (!c.key) continue;
    if (c.active === false) inactive.push({ file: c.file, key: c.key, activity: c.activity });
  }

  const byCategory: Record<string, number> = {};
  const tagCounts = new Map<string, number>();
  let activeCount = 0;
  let inactiveCount = 0;
  for (const c of cards) {
    const cat = c.category ?? "unknown";
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    if (c.active === false) inactiveCount += 1;
    else activeCount += 1; // treat null as active for audit purposes
    for (const t of c.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const tagCountsTop = Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 30);

  return {
    files_scanned: jsonFiles.length,
    cards_scanned: cards.length,
    errors,
    duplicates,
    spanish_orphans: spanishOrphans.sort((a, b) => a.key.localeCompare(b.key)),
    inactive,
    stats: {
      total: cards.length,
      active: activeCount,
      inactive: inactiveCount,
      by_category: byCategory,
      tag_counts_top: tagCountsTop,
    },
  };
}

function cmdDeck(args: string[], json: boolean): void {
  const sub = args[0] ?? "audit";
  if (isHelpToken(sub)) {
    const usage = ["deck audit [--json]", "deck stats [--json]", "deck duplicates [--json]", "deck orphans [--json]"];
    if (json) {
      printJson({ ok: true, command: "deck", help: true, usage });
      return;
    }
    console.log("Deck usage:");
    for (const u of usage) console.log(`  site-toggle ${u}`);
    return;
  }

  const audit = auditDeckFromDir(cardsDirPath());
  if (sub === "stats") {
    const payload = {
      ok: true,
      command: "deck",
      action: "stats",
      files_scanned: audit.files_scanned,
      cards_scanned: audit.cards_scanned,
      ...audit.stats,
    };
    if (json) printJson(payload);
    else console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (sub === "duplicates") {
    const payload = { ok: true, command: "deck", action: "duplicates", duplicates: audit.duplicates };
    if (json) printJson(payload);
    else console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (sub === "orphans") {
    const payload = { ok: true, command: "deck", action: "orphans", spanish_orphans: audit.spanish_orphans };
    if (json) printJson(payload);
    else console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (sub !== "audit") throw new Error("Usage: deck <audit|stats|duplicates|orphans>");

  const payload = { ok: true, command: "deck", action: "audit", ...audit };
  if (json) printJson(payload);
  else console.log(JSON.stringify(payload, null, 2));
}

function parseArgs(argv: string[]): { command: string; args: string[]; json: boolean } {
  const args = [...argv];
  let json = false;
  const filtered: string[] = [];
  for (const a of args) {
    if (a === "--json") {
      json = true;
      continue;
    }
    filtered.push(a);
  }

  const command = filtered[0] ?? "status";
  return { command, args: filtered.slice(1), json };
}

function isHelpToken(value: string | undefined): boolean {
  return value === "--help" || value === "-h" || value === "help";
}

function printJson(obj: unknown): void {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function isRoot(): boolean {
  return typeof process.getuid === "function" && process.getuid() === 0;
}

function requireRootFor(command: string): void {
  if (isRoot()) return;
  throw new Error(`"${command}" requires sudo/root (needs to edit ${HOSTS_FILE_PATH}).`);
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function siteToggleJsPath(): string {
  // When running compiled: packages/cli/dist/index.js
  return fileURLToPath(import.meta.url);
}

function notify(title: string, message: string): void {
  try {
    execFileSync("osascript", [
      "-e",
      `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)} sound name "Funk"`,
    ]);
  } catch {
    // ignore
  }
}

function spawnDetached(args: string[]): number {
  const child = spawn(process.execPath, args, { detached: true, stdio: "ignore" });
  child.unref();
  if (!child.pid) throw new Error("Failed to spawn detached process");
  return child.pid;
}

function logHuman(line: string, json: boolean): void {
  if (!json) console.log(line);
}

function isInteractive(json: boolean): boolean {
  if (json) return false;
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function printPromptBlock(prompt: string | null): void {
  if (!prompt || prompt.trim().length === 0) return;
  console.log("");
  console.log("AI Prompt (copy & paste):");
  console.log("------------------------");
  console.log(prompt.trim());
  console.log("------------------------");
  console.log("");
}

function printMainHelp(json: boolean): void {
  const commands = [
    "status",
    "on",
    "off",
    "stats",
    "clear-stats",
    "seed",
    "deck",
    "suggest",
    "break",
    "choose",
    "rate",
    "locations",
    "contexts",
    "context",
    "modules",
    "module",
    "import",
    "run-lines",
    "speak",
    "listen",
    "play",
    "ui",
    "doctor",
  ];

  if (json) {
    printJson({
      ok: true,
      command: "help",
      usage: "site-toggle <command> [args] [--json]",
      commands,
    });
    return;
  }

  console.log("Usage:");
  console.log("  site-toggle <command> [args] [--json]");
  console.log("");
  console.log("Commands:");
  for (const cmd of commands) console.log(`  - ${cmd}`);
  console.log("");
  console.log('Tips: use "site-toggle <command> --help" or "site-toggle module --help" for details.');
}

function uiStateDir(): string {
  return path.join(path.dirname(resolveDbPath()), "ui-server");
}

function uiStatePath(): string {
  return path.join(uiStateDir(), "state.json");
}

function tryReadUiState(): any | null {
  try {
    const raw = fs.readFileSync(uiStatePath(), "utf8");
    return JSON.parse(raw) as any;
  } catch {
    return null;
  }
}

function isPidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function ensureExecutableOnPath(cmd: string): void {
  try {
    execFileSync("command", ["-v", cmd], { stdio: "ignore" });
  } catch {
    throw new Error(`${cmd} not found on PATH.`);
  }
}

async function cmdUi(args: string[], json: boolean): Promise<void> {
  const sub = args[0] ?? "status";
  const subArgs = args.slice(1);

  if (isHelpToken(sub)) {
    const usage = [
      "site-toggle ui start [--port N] [--dev] [--json]",
      "site-toggle ui stop [--json]",
      "site-toggle ui status [--json]",
      "site-toggle ui open",
      "site-toggle ui signal <name> [--payload-json '{...}'] [--payload 'text'] [--json]",
    ];
    if (json) {
      printJson({ ok: true, command: "ui", help: true, usage });
      return;
    }
    console.log("UI usage:");
    for (const u of usage) console.log(`  ${u}`);
    return;
  }

  if (sub === "status") {
    const state = tryReadUiState();
    const pid = Number(state?.pid ?? 0);
    const running = isPidAlive(pid);
    if (json) {
      printJson({ ok: true, command: "ui", action: "status", running, state: state ?? null });
      return;
    }
    if (!state) {
      console.log("ui-server: not running (no state.json)");
      return;
    }
    console.log(`ui-server: ${running ? "running" : "not running"} (pid ${pid || "?"})`);
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  if (sub === "start") {
    ensureExecutableOnPath("bun");

    const stateDir = uiStateDir();
    fs.mkdirSync(stateDir, { recursive: true });
    const logPath = path.join(stateDir, "server.log");

    const existing = tryReadUiState();
    const existingPid = Number(existing?.pid ?? 0);
    if (existing && isPidAlive(existingPid)) {
      if (json) printJson({ ok: true, command: "ui", action: "start", already_running: true, state: existing });
      else console.log(`ui-server already running (pid ${existingPid})`);
      return;
    }

    // Parse flags: --port N, --dev
    let port: number | null = null;
    let dev = false;
    for (let i = 0; i < subArgs.length; i += 1) {
      const a = subArgs[i];
      const next = subArgs[i + 1];
      if (a === "--port" && next && /^\d+$/.test(next)) {
        port = Number(next);
        i += 1;
        continue;
      }
      if (a === "--dev") {
        dev = true;
        continue;
      }
    }

    const repoRoot = repoRootFromHere();
    const serverTs = path.join(repoRoot, "packages", "ui-server", "src", "server.ts");

    const bunArgs = ["run", serverTs, "--state-dir", stateDir];
    if (port !== null) bunArgs.push("--port", String(port));
    if (dev) bunArgs.push("--dev");

    const outFd = fs.openSync(logPath, "a");
    const child = spawn("bun", bunArgs, { detached: true, stdio: ["ignore", outFd, outFd] });
    child.unref();

    // Poll for state.json to appear (server writes it after bind).
    const deadline = Date.now() + 2500;
    while (Date.now() < deadline) {
      const st = tryReadUiState();
      if (st?.pid && isPidAlive(Number(st.pid))) {
        if (json) printJson({ ok: true, command: "ui", action: "start", started: true, state: st });
        else console.log(`ui-server started (pid ${st.pid}) → ${st.ui_url}`);
        return;
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    throw new Error(`ui-server failed to start (no state.json after 2.5s). Check logs: ${logPath}`);
  }

  if (sub === "stop") {
    const state = tryReadUiState();
    const pid = Number(state?.pid ?? 0);
    if (!state || !pid) {
      if (json) printJson({ ok: true, command: "ui", action: "stop", already_stopped: true });
      else console.log("ui-server already stopped.");
      return;
    }

    if (isPidAlive(pid)) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // ignore
      }
      await new Promise((r) => setTimeout(r, 200));
      if (isPidAlive(pid)) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // ignore
        }
      }
    }

    try {
      fs.rmSync(uiStatePath(), { force: true });
    } catch {
      // ignore
    }

    if (json) printJson({ ok: true, command: "ui", action: "stop", stopped: true, pid });
    else console.log(`ui-server stopped (pid ${pid})`);
    return;
  }

  if (sub === "open") {
    const state = tryReadUiState();
    const url = String(state?.ui_url ?? "");
    if (!url) throw new Error("ui-server not running (missing ui_url in state.json).");
    execFileSync("open", [url], { stdio: "ignore" });
    if (json) printJson({ ok: true, command: "ui", action: "open", url });
    return;
  }

  if (sub === "signal") {
    const name = subArgs[0];
    if (!name) throw new Error("Usage: site-toggle ui signal <name> [--payload-json '{...}'] [--payload 'text']");

    let payload: unknown = null;
    for (let i = 1; i < subArgs.length; i += 1) {
      const a = subArgs[i];
      const next = subArgs[i + 1];
      if (a === "--payload-json" && next) {
        payload = JSON.parse(next);
        i += 1;
        continue;
      }
      if (a === "--payload" && next) {
        payload = next;
        i += 1;
        continue;
      }
    }

    const state = tryReadUiState();
    const port = Number(state?.port ?? 0);
    const token = String(state?.token ?? "");
    if (!port || !token) throw new Error("ui-server not running (missing port/token in state.json).");

    const res = await fetch(`http://127.0.0.1:${port}/api/action`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cb-token": token,
      },
      body: JSON.stringify({ v: 1, action: "agent.signal", payload: { name, payload } }),
    });
    const data = await res.json();
    if (json) printJson(data);
    else console.log(JSON.stringify(data, null, 2));
    return;
  }

  throw new Error(`Unknown ui subcommand: ${sub}`);
}

function printModuleHelp(json: boolean, moduleSlug?: string): void {
  const actions = ["history", "start", "complete", "resume", "last", "srs", "test", "test-complete"];
  const usageBase = moduleSlug ? `site-toggle module ${moduleSlug}` : "site-toggle module <slug>";

  if (json) {
    printJson({
      ok: true,
      command: "module",
      help: true,
      usage: `${usageBase} <${actions.join("|")}> [args]`,
      actions,
    });
    return;
  }

  console.log("Module usage:");
  console.log(`  ${usageBase} <${actions.join("|")}> [args]`);
  console.log("");
  console.log("Actions:");
  for (const action of actions) console.log(`  - ${action}`);
  console.log("");
  console.log(`Examples:`);
  console.log(`  ${usageBase} history --days 7 --limit 5 --json`);
  console.log(`  ${usageBase} srs --json`);
  console.log(`  ${usageBase} test --count 20 --json`);
}

function printModuleActionHelp(json: boolean, moduleSlug: string, action: string): void {
  const base = `site-toggle module ${moduleSlug}`;
  let usage = `${base} ${action}`;
  const notes: string[] = [];

  switch (action) {
    case "history":
      usage = `${base} history [--days N] [--limit N] [--served-limit N] [--unique] [--only sessions|served] [--status open|completed|partial|abandoned]`;
      break;
    case "start":
      usage = `${base} start <card_id|card_key>`;
      break;
    case "complete":
      usage = `${base} complete --status completed|partial|abandoned [--parts ...] [--note ...] [--event-key <k> --card-id <id>]`;
      break;
    case "resume":
      usage = `${base} resume`;
      break;
    case "last":
      usage = `${base} last`;
      break;
    case "srs":
      usage = `${base} srs [--json]`;
      notes.push('Outputs current spaced repetition (SRS) state for the module (currently "spanish" only).');
      break;
    case "test":
      usage = `${base} test [--count N] [--days N]`;
      notes.push("Returns a randomized subset of completed verbs (no answer keys).");
      notes.push("Each verb includes a randomized tense + person pick for quizzing.");
      break;
    case "test-complete":
      usage = `${base} test-complete <event_key> --score <n> --total <n> [--duration-seconds <n>]`;
      break;
    default:
      usage = `${base} ${action}`;
      break;
  }

  if (json) {
    printJson({ ok: true, command: "module", help: true, action, usage, notes });
    return;
  }

  console.log("Module action usage:");
  console.log(`  ${usage}`);
  if (notes.length > 0) {
    console.log("");
    for (const note of notes) console.log(`  - ${note}`);
  }
}

async function resolveContextOrThrow(db: any, opts: { location?: string; context?: string; json: boolean }): Promise<string | undefined> {
  if (opts.location) return undefined;

  const fromArgs = opts.context?.trim();
  if (fromArgs) return fromArgs;

  const fromEnv = (process.env["CIRCUIT_BREAKER_CONTEXT"] ?? "").trim();
  if (fromEnv) return fromEnv;

  const fromSetting = (getSetting(db, "current_context") ?? "").trim();
  if (fromSetting) return fromSetting;

  if (opts.json) {
    throw new CliError(
      "CONTEXT_REQUIRED",
      "Context required. Use --context <slug>, set CIRCUIT_BREAKER_CONTEXT, or run `site-toggle context set <slug>`.",
    );
  }

  if (!isInteractive(opts.json)) return undefined;

  const contexts = listContexts(db);
  if (contexts.length === 0) {
    throw new CliError("CONTEXT_REQUIRED", "No contexts defined. Import or add contexts first.");
  }

  const slugs = contexts.map((c) => c.slug);
  console.log(`Context required. Available: ${slugs.join(", ")}`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question("Context: ")).trim();
    if (!answer) throw new CliError("CONTEXT_REQUIRED", "Context required.");
    if (!slugs.includes(answer)) throw new Error(`Unknown context: ${answer}`);
    setSetting(db, "current_context", answer);
    return answer;
  } finally {
    rl.close();
  }
}

async function cmdDoctor(json: boolean): Promise<void> {
  const dbPath = resolveDbPath();
  const report: {
    ok: boolean;
    command: "doctor";
    node: string;
    uid: number | null;
    sudo_user: string | null;
    db_path: string;
    hosts_path: string;
    timers_path: string;
    hosts_readable?: boolean;
    hosts_writable?: boolean;
    edge_tts?: boolean;
    sox?: boolean;
    afplay?: boolean;
    fluidsynth?: boolean;
    sf2_path?: string | null;
    sf2_ok?: boolean;
    python3?: boolean;
    python_path?: string;
    python_torch?: boolean;
    python_transformers?: boolean;
    python_numpy?: boolean;
    python_mps_built?: boolean;
    python_mps_available?: boolean;
    phonemize_script?: boolean;
  } = {
    ok: true,
    command: "doctor",
    node: process.versions.node,
    uid: typeof process.getuid === "function" ? process.getuid() : null,
    sudo_user: process.env["SUDO_USER"] ?? null,
    db_path: dbPath,
    hosts_path: HOSTS_FILE_PATH,
    timers_path: TIMER_DIR_PATH,
  };

  // Ensure DB can open / schema can initialize.
  const { db } = openDb();
  db.close();

  // Timer dir exists.
  fs.mkdirSync(TIMER_DIR_PATH, { recursive: true });

  // Hosts file readable (and writable if root).
  try {
    fs.accessSync(HOSTS_FILE_PATH, fs.constants.R_OK);
    report.hosts_readable = true;
  } catch {
    report.hosts_readable = false;
    report.ok = false;
  }

  if (isRoot()) {
    try {
      fs.accessSync(HOSTS_FILE_PATH, fs.constants.W_OK);
      report.hosts_writable = true;
    } catch {
      report.hosts_writable = false;
      report.ok = false;
    }
  }

  report.edge_tts = commandExists("edge-tts");
  report.sox = commandExists("sox");
  report.afplay = commandExists("afplay");

  const fluidsynthBin = (process.env["CIRCUIT_BREAKER_FLUIDSYNTH_BIN"] ?? "").trim() || "fluidsynth";
  report.fluidsynth = commandExists(fluidsynthBin);
  report.sf2_path = (process.env["CIRCUIT_BREAKER_SF2_PATH"] ?? "").trim() || null;
  report.sf2_ok = report.sf2_path ? fileExistsNonEmpty(report.sf2_path) : false;

  let pythonPath: string | null = null;
  try {
    pythonPath = pythonExecPath();
    report.python3 = true;
    report.python_path = pythonPath;
  } catch {
    report.python3 = false;
  }
  report.python_torch = report.python3 && pythonPath ? pythonModuleExists(pythonPath, "torch") : false;
  report.python_transformers = report.python3 && pythonPath ? pythonModuleExists(pythonPath, "transformers") : false;
  report.python_numpy = report.python3 && pythonPath ? pythonModuleExists(pythonPath, "numpy") : false;
  report.phonemize_script = fileExistsNonEmpty(phonemizeScriptPath());

  if (report.python_torch && pythonPath) {
    try {
      const out = execFileSync(
        pythonPath,
        ["-c", "import torch; print(f\"{torch.backends.mps.is_built()}|{torch.backends.mps.is_available()}\")"],
        { encoding: "utf8" },
      ).trim();
      const [builtRaw, availRaw] = out.split("|");
      report.python_mps_built = builtRaw === "True";
      report.python_mps_available = availRaw === "True";
    } catch {
      report.python_mps_built = false;
      report.python_mps_available = false;
    }
  } else {
    report.python_mps_built = false;
    report.python_mps_available = false;
  }

  if (
    !report.edge_tts ||
    !report.sox ||
    !report.afplay ||
    !report.fluidsynth ||
    !report.sf2_ok ||
    !report.python3 ||
    !report.python_torch ||
    !report.python_transformers ||
    !report.python_numpy ||
    !report.python_mps_built ||
    !report.python_mps_available ||
    !report.phonemize_script
  ) {
    report.ok = false;
  }

  if (json) {
    printJson(report);
    return;
  }

  console.log("Doctor");
  console.log("======");
  console.log(`Node: ${process.versions.node}`);
  console.log(`Root: ${isRoot() ? "yes" : "no"}`);
  console.log(`DB: ${dbPath}`);
  console.log(
    `Hosts: ${HOSTS_FILE_PATH} (${report.hosts_readable ? "readable" : "NOT readable"}${isRoot() ? report.hosts_writable ? ", writable" : ", NOT writable" : ""})`,
  );
  console.log(`Timers dir: ${TIMER_DIR_PATH}`);
  console.log(`edge-tts: ${report.edge_tts ? "ok" : "MISSING"}`);
  console.log(`sox: ${report.sox ? "ok" : "MISSING"}`);
  console.log(`afplay: ${report.afplay ? "ok" : "MISSING"}`);
  console.log(`fluidsynth: ${report.fluidsynth ? "ok" : "MISSING"}${fluidsynthBin !== "fluidsynth" ? ` (${fluidsynthBin})` : ""}`);
  console.log(`SoundFont: ${report.sf2_ok ? "ok" : "MISSING"}${report.sf2_path ? ` (${report.sf2_path})` : ""}`);
  console.log(`python3: ${report.python3 ? "ok" : "MISSING"}${report.python_path ? ` (${report.python_path})` : ""}`);
  console.log(`torch: ${report.python_torch ? "ok" : "MISSING"}`);
  console.log(`transformers: ${report.python_transformers ? "ok" : "MISSING"}`);
  console.log(`numpy: ${report.python_numpy ? "ok" : "MISSING"}`);
  console.log(
    `mps: ${report.python_mps_built ? (report.python_mps_available ? "available" : "NOT available") : "NOT built"}`,
  );
  console.log(`phonemize script: ${report.phonemize_script ? "ok" : "MISSING"}`);
  console.log("");
  console.log(report.ok ? "✅ OK" : "❌ Issues detected");
}

function getSiteOrThrow(db: any, slug: string): { id: number; slug: string; default_minutes: number } {
  const site = getSiteBySlug(db, slug);
  if (!site) throw new Error(`Unknown site: ${slug}`);
  return { id: site.id, slug: site.slug, default_minutes: site.default_minutes };
}

function unblockSiteInHosts(db: any, hosts: string, slug: string, minutes: number, source: string): { hosts: string; pid: number } {
  const site = getSiteOrThrow(db, slug);

  killTimer(slug);

  const domains = getDomainsForSiteId(db, site.id);
  const nextHosts = unblockDomains(hosts, domains);

  insertEvent(db, { type: "unblock", siteId: site.id, siteSlug: site.slug, minutes, metaJson: JSON.stringify({ source }) });
  setSiteUnblockedUntil(db, site.id, nowUnix() + minutes * 60);

  const { pid } = startTimer({
    siteSlug: slug,
    minutes,
    execPath: process.execPath,
    args: [siteToggleJsPath(), "_timer", slug, String(minutes)],
  });

  return { hosts: nextHosts, pid };
}

function blockSiteInHosts(db: any, hosts: string, slug: string, source: string): string {
  const site = getSiteOrThrow(db, slug);

  killTimer(slug);

  const domains = getDomainsForSiteId(db, site.id);
  const nextHosts = blockDomains(hosts, domains);

  insertEvent(db, { type: "block", siteId: site.id, siteSlug: site.slug, metaJson: JSON.stringify({ source }) });
  setSiteUnblockedUntil(db, site.id, null);

  return nextHosts;
}

function cmdStatus(json: boolean): void {
  const { db } = openDb();
  const sites = getAllSites(db);
  const hosts = readHostsFile();

  const siteStatuses = sites.map((site) => {
    const domains = getDomainsForSiteId(db, site.id);
    const firstDomain = domains[0] ?? "";
    const blocked = firstDomain ? isDomainBlocked(hosts, firstDomain) : false;
    const timer = getTimerStatus(site.slug);
    return {
      slug: site.slug,
      type: site.type,
      default_minutes: site.default_minutes,
      blocked,
      timer_pid: timer.pid,
      timer_running: timer.running,
    };
  });

  if (json) {
    printJson({ ok: true, command: "status", sites: siteStatuses });
    return;
  }

  console.log("Site blocking status:");
  console.log("---------------------");
  console.log("");

  type GroupKey = "social" | "news" | "tech" | "other";
  const groups: Record<GroupKey, typeof siteStatuses> = {
    social: [],
    news: [],
    tech: [],
    other: [],
  };
  for (const s of siteStatuses) {
    const key: GroupKey = s.type === "social" || s.type === "news" || s.type === "tech" ? s.type : "other";
    groups[key].push(s);
  }

  const order: Array<{ key: GroupKey; label: string }> = [
    { key: "social", label: "Social" },
    { key: "news", label: "News" },
    { key: "tech", label: "Tech" },
    { key: "other", label: "Other" },
  ];

  for (const g of order) {
    const list = groups[g.key];
    if (!list || list.length === 0) continue;
    console.log(`${g.label}:`);
    for (const s of list.sort((a, b) => a.slug.localeCompare(b.slug))) {
      const status = s.blocked ? "🔒 BLOCKED" : "🔓 allowed";
      const timer = s.timer_running ? " (auto-reblock pending)" : "";
      console.log(`  ${status}${timer}: ${s.slug}`);
    }
    console.log("");
  }
}

function cmdOn(args: string[], json: boolean): void {
  requireRootFor("on");
  const { db } = openDb();
  const siteSlug = args[0] ?? "";
  const minutesArg = args[1];
  const explicitMinutes = minutesArg && /^\d+$/.test(minutesArg) ? Number(minutesArg) : null;

  const targets = siteSlug ? [siteSlug] : ALL_SITE_SLUGS;
  let hosts = readHostsFile();

  const results: Array<{ site: string; minutes: number }> = [];

  for (const slug of targets) {
    const site = getSiteOrThrow(db, slug);
    const minutes = explicitMinutes ?? site.default_minutes;
    const res = unblockSiteInHosts(db, hosts, slug, minutes, "manual");
    hosts = res.hosts;
    results.push({ site: slug, minutes });
    logHuman(`[${new Date().toLocaleTimeString()}] 🔓 Unblocked: ${slug} (pid ${res.pid})`, json);
  }

  writeHostsAndFlush(hosts);

  if (json) {
    printJson({ ok: true, command: "on", targets: results });
  }
}

function writeHostsAndFlush(contents: string): void {
  // Use core's writeHostsFile which ensures essential entries (localhost, etc.) are preserved
  writeHostsFile(contents);
  flushDns();
}

function cmdOff(args: string[], json: boolean): void {
  requireRootFor("off");
  const { db } = openDb();
  const siteSlug = args[0] ?? "";
  const targets = siteSlug ? [siteSlug] : ALL_SITE_SLUGS;

  let hosts = readHostsFile();
  const results: Array<{ site: string }> = [];

  for (const slug of targets) {
    hosts = blockSiteInHosts(db, hosts, slug, "manual");
    results.push({ site: slug });
    logHuman(`[${new Date().toLocaleTimeString()}] 🔒 Blocked: ${slug}`, json);
  }

  writeHostsAndFlush(hosts);

  if (json) {
    printJson({ ok: true, command: "off", targets: results });
  }
}

function cmdTimer(args: string[], json: boolean): void {
  const siteSlug = args[0];
  const minutesRaw = args[1];
  if (!siteSlug || !minutesRaw || !/^\d+$/.test(minutesRaw)) throw new Error("Usage: _timer <site> <minutes>");
  const minutes = Number(minutesRaw);

  // sleep, then re-block
  const ms = minutes * 60 * 1000;
  setTimeout(() => {
    try {
      const { db } = openDb();
      const site = getSiteBySlug(db, siteSlug);
      if (!site) return;

      const domains = getDomainsForSiteId(db, site.id);
      let hosts = readHostsFile();
      hosts = blockDomains(hosts, domains);
      writeHostsAndFlush(hosts);

      insertEvent(db, { type: "block", siteId: site.id, siteSlug: site.slug, metaJson: JSON.stringify({ source: "timer" }) });
      setSiteUnblockedUntil(db, site.id, null);
      try {
        fs.rmSync(path.join(TIMER_DIR_PATH, `${siteSlug}.pid`), { force: true });
      } catch {
        // ignore
      }

      notify("Circuit Breaker", `${siteSlug} has been re-blocked`);
    } catch {
      // ignore
    }

    if (json) {
      printJson({ ok: true, command: "_timer", site: siteSlug, minutes });
    }
    process.exit(0);
  }, ms);
}

function cmdReentry(args: string[], json: boolean): void {
  const eventKey = args[0];
  const minutesRaw = args[1];
  const cardIdRaw = args[2];
  if (!eventKey || !minutesRaw || !/^\d+$/.test(minutesRaw)) throw new Error("Usage: _reentry <event_key> <minutes> [card_id]");
  const minutes = Number(minutesRaw);
  const cardId = cardIdRaw && /^\d+$/.test(cardIdRaw) ? Number(cardIdRaw) : null;

  setTimeout(() => {
    try {
      const { db } = openDb();
      insertEvent(db, {
        type: "reentry_prompted",
        eventKey,
        cardId: cardId ?? null,
        metaJson: JSON.stringify({ source: "timer" }),
      });
      notify("Re-entry", "What’s the next smallest action? (1 sentence, then go.)");
    } catch {
      // ignore
    }

    if (json) {
      printJson({ ok: true, command: "_reentry", event_key: eventKey, minutes, card_id: cardId });
    }
    process.exit(0);
  }, minutes * 60 * 1000);
}

function cmdSeed(json: boolean): void {
  const { db } = openDb();
  const cardsDir = path.join(repoRootFromHere(), "data", "cards");
  const result = seedCardsFromDir(db, cardsDir);
  if (json) {
    printJson({ ok: true, command: "seed", cards_dir: cardsDir, ...result });
    return;
  }
  console.log(`Seeded cards from ${cardsDir}`);
  console.log(`Files: ${result.files}`);
  console.log(`Inserted: ${result.inserted}`);
  console.log(`Updated: ${result.updated}`);
  if (Array.isArray((result as any).duplicate_keys) && (result as any).duplicate_keys.length > 0) {
    const dups = (result as any).duplicate_keys as Array<{ key: string; files: string[] }>;
    console.log("");
    console.log(`WARNING: Duplicate card keys found across files (${dups.length}).`);
    console.log("These will upsert in file sort order; consider deduping the deck to avoid accidental overrides.");
    for (const d of dups.slice(0, 25)) {
      console.log(`- ${d.key}: ${d.files.join(", ")}`);
    }
    if (dups.length > 25) {
      console.log(`... (+${dups.length - 25} more)`);
    }
  }
}

async function cmdSuggest(args: string[], json: boolean): Promise<void> {
  const { db } = openDb();
  const countRaw = args[0];
  const count = countRaw && /^\d+$/.test(countRaw) ? Number(countRaw) : 2;
  const eventKey = generateSuggestEventKey();

  // Support either flags or positional category/location:
  // - suggest 2 --category restorative --location ruzafa
  // - suggest 2 restorative
  let category: string | undefined;
  let location: string | undefined;
  let context: string | undefined;
  for (let i = 1; i < args.length; i += 1) {
    const a = args[i];
    if (!a) continue;
    const next = args[i + 1];
    if (a === "--category" && next) {
      category = next;
      i += 1;
      continue;
    }
    if (a === "--location" && next) {
      location = next;
      i += 1;
      continue;
    }
    if (a === "--context" && next) {
      context = next;
      i += 1;
      continue;
    }
    if (!a.startsWith("--") && !category) category = a;
  }

  const resolvedContext = await resolveContextOrThrow(db, { location, context, json });
  const cards = selectBreakCards(db, { count, category, location, context: location ? undefined : resolvedContext });
  for (const c of cards) {
    insertEvent(db, {
      type: "card_served",
      eventKey,
      cardId: c.id,
      metaJson: JSON.stringify({
        source: "suggest",
        category: category ?? null,
        location: location ?? null,
        context: location ? null : resolvedContext ?? null,
      }),
    });
  }

  if (json) {
    printJson({
      ok: true,
      command: "suggest",
      event_key: eventKey,
      context: location ? undefined : resolvedContext ?? null,
      cards: cards.map((c) => ({
        id: c.id,
        key: c.key,
        category: c.category,
        minutes: c.minutes,
        activity: c.activity,
        done: c.doneCondition,
        prompt: c.prompt,
        location: c.location,
        rarity: c.rarity,
        tags: c.tags,
      })),
    });
    return;
  }

  for (const c of cards) {
    console.log(`• ${c.activity} (${c.minutes} min) — ${c.doneCondition}`);
    if (c.prompt) printPromptBlock(c.prompt);
  }
}

async function cmdBreak(args: string[], json: boolean): Promise<void> {
  const siteSlug = args[0];
  if (!siteSlug) throw new Error("Usage: break <site> [--minutes N]");

  let minutes: number | undefined;
  let location: string | undefined;
  let context: string | undefined;
  for (let i = 1; i < args.length; i += 1) {
    const a = args[i];
    if (!a) continue;
    const next = args[i + 1];
    if (a === "--minutes" && next && /^\d+$/.test(next)) {
      minutes = Number(next);
      i += 1;
      continue;
    }
    if (a === "--location" && next) {
      location = next;
      i += 1;
      continue;
    }
    if (a === "--context" && next) {
      context = next;
      i += 1;
      continue;
    }
    if (/^\d+$/.test(a) && minutes === undefined) minutes = Number(a);
  }

  const { db } = openDb();
  const resolvedContext = await resolveContextOrThrow(db, { location, context, json });
  const menu = buildBreakMenu({ db, siteSlug, feedMinutes: minutes, location, context: location ? undefined : resolvedContext });
  const hasActingLane = menu.lanes.some((l) => l.type === "acting");

  // Log served menu + served card.
  insertEvent(db, {
    type: "break_served",
    eventKey: menu.event_key,
    siteId: getSiteBySlug(db, menu.site)?.id ?? null,
    siteSlug: menu.site,
    minutes: (menu.lanes.find((l) => l.type === "feed") as any)?.minutes ?? null,
    metaJson: JSON.stringify(menu),
  });

  // Log both cards as served
  for (const lane of menu.lanes) {
    if ((lane as any)?.card?.id && lane.type !== "feed" && lane.type !== "same_need") {
      insertEvent(db, {
        type: "card_served",
        eventKey: menu.event_key,
        siteSlug: menu.site,
        cardId: (lane as any).card.id,
        metaJson: JSON.stringify({ source: "break", lane: lane.type }),
      });
    }
  }

  type RecentActingScript = {
    id: number;
    title: string;
    source_format: string;
    created_at: string;
    last_practiced_at: string | null;
    character_count: number;
    dialogue_lines: number;
    character_names: string[];
  };

  const loadRecentActingScripts = (limit: number): RecentActingScript[] => {
    try {
      const { db: actingDb } = openActingDb();
      const rows = actingDb
        .prepare(
          `
          WITH last_practice AS (
            SELECT script_id, MAX(created_at) AS last_practiced_at
            FROM script_practice_events
            GROUP BY script_id
          )
          SELECT
            s.id,
            s.title,
            s.source_format,
            s.created_at,
            lp.last_practiced_at,
            (SELECT COUNT(*) FROM script_characters c WHERE c.script_id = s.id) AS character_count,
            (SELECT COUNT(*) FROM script_lines l WHERE l.script_id = s.id AND l.type = 'dialogue') AS dialogue_lines
          FROM scripts s
          LEFT JOIN last_practice lp ON lp.script_id = s.id
          ORDER BY COALESCE(lp.last_practiced_at, s.created_at) DESC, s.id DESC
          LIMIT ?
        `,
        )
        .all(limit) as Array<{
        id: number;
        title: string;
        source_format: string;
        created_at: string;
        last_practiced_at: string | null;
        character_count: number;
        dialogue_lines: number;
      }>;

      const nameStmt = actingDb.prepare("SELECT name FROM script_characters WHERE script_id = ? ORDER BY name");
      return rows.map((r) => {
        const nameRows = nameStmt.all(r.id) as Array<{ name: string }>;
        const names = nameRows.map((nr) => nr.name).filter(Boolean);
        return { ...r, character_names: names };
      });
    } catch {
      return [];
    }
  };

  const recentActingScripts: RecentActingScript[] = hasActingLane ? loadRecentActingScripts(3) : [];

  if (json) {
    // Avoid mutating the menu that we just logged into the events table; enrich only the output.
    const lanes = menu.lanes.map((l) => (l.type === "acting" ? ({ ...l, recent_scripts: recentActingScripts } as any) : l));
    printJson({ ok: true, command: "break", ...menu, lanes });
    return;
  }

  console.log(`Break menu for ${menu.site}`);
  console.log("");
  const labelForLane = (type: string): string => {
    switch (type) {
      case "physical":
        return "Physical";
      case "verb":
        return "Verb";
      case "noun":
        return "Noun";
      case "lesson":
        return "B1/B2 Lesson";
      case "sovt":
        return "SOVT / Pitch";
      case "acting":
        return "Run Lines";
      case "fusion":
        return "Fusion";
      case "card":
        return "Card";
      case "card2":
        return "Card2";
      default:
        return type;
    }
  };

  let optionNum = 1;
  for (const lane of menu.lanes) {
    if (lane.type === "same_need") {
      console.log(`${optionNum}) Same-need: ${lane.prompt}`);
      optionNum += 1;
      continue;
    }
    if (lane.type === "feed") {
      console.log(`${optionNum}) Feed: unblock ${lane.site} for ${lane.minutes} min`);
      optionNum += 1;
      continue;
    }

    const card = (lane as any).card;
    if (!card) continue;
    console.log(`${optionNum}) ${labelForLane(lane.type)} [${card.category}]: ${card.activity} (${card.minutes} min) — ${card.doneCondition}`);
    if (card.prompt) printPromptBlock(card.prompt);
    if (lane.type === "acting" && recentActingScripts.length > 0) {
      console.log("");
      console.log("Recent scenes:");
      for (const s of recentActingScripts) {
        const when = s.last_practiced_at ? `last practiced ${s.last_practiced_at}` : `imported ${s.created_at}`;
        const chars = s.character_count === 1 ? "1 character" : `${s.character_count} characters`;
        console.log(`- [${s.id}] ${s.title} (${when}; ${chars}, ${s.dialogue_lines} dialogue lines)`);
      }
      console.log(`Tip: site-toggle run-lines characters <script_id> --json`);
      console.log(`Tip: site-toggle run-lines practice <script_id> --me "<YOUR_CHARACTER>" --mode practice --loop 2`);
    }
    optionNum += 1;
  }
  console.log("");
  console.log(`Choose: site-toggle choose ${menu.event_key} physical|verb|noun|lesson|sovt|acting|fusion|feed|same_need`);
  console.log("(Legacy aliases: card=first card lane, card2=second card lane)");
}

function cmdLocations(args: string[], json: boolean): void {
  const { db } = openDb();

  if (args[0] === "add") {
    const slug = args[1];
    const name = args[2];
    if (!slug) throw new Error("Usage: locations add <slug> [name]");
    addLocation(db, slug, name);
    if (json) printJson({ ok: true, command: "locations", action: "add", slug, name: name ?? null });
    else console.log(`Added location ${slug}`);
    return;
  }

  const locations = listLocations(db);
  if (json) {
    printJson({ ok: true, command: "locations", locations: locations.map((l) => ({ slug: l.slug, name: l.name })) });
    return;
  }

  console.log("Locations");
  console.log("=========");
  for (const l of locations) {
    console.log(`- ${l.slug}${l.name ? ` — ${l.name}` : ""}`);
  }
}

function cmdContexts(args: string[], json: boolean): void {
  const { db } = openDb();

  const sub = args[0];
  if (sub === "add") {
    const slug = args[1];
    const name = args[2];
    if (!slug) throw new Error("Usage: contexts add <slug> [name]");
    addContext(db, slug, name);
    if (json) printJson({ ok: true, command: "contexts", action: "add", slug, name: name ?? null });
    else console.log(`Added context ${slug}`);
    return;
  }

  if (sub === "link") {
    const contextSlug = args[1];
    const locationSlug = args[2];
    if (!contextSlug || !locationSlug) throw new Error("Usage: contexts link <context> <location>");
    linkContextLocation(db, contextSlug, locationSlug);
    if (json) printJson({ ok: true, command: "contexts", action: "link", context: contextSlug, location: locationSlug });
    else console.log(`Linked ${contextSlug} -> ${locationSlug}`);
    return;
  }

  if (sub === "unlink") {
    const contextSlug = args[1];
    const locationSlug = args[2];
    if (!contextSlug || !locationSlug) throw new Error("Usage: contexts unlink <context> <location>");
    unlinkContextLocation(db, contextSlug, locationSlug);
    if (json) printJson({ ok: true, command: "contexts", action: "unlink", context: contextSlug, location: locationSlug });
    else console.log(`Unlinked ${contextSlug} -> ${locationSlug}`);
    return;
  }

  const contexts = listContexts(db);
  const expanded = contexts.map((c) => {
    const { locations } = getContextLocations(db, c.slug);
    return { slug: c.slug, name: c.name, locations: locations.map((l) => l.slug) };
  });

  if (json) {
    printJson({ ok: true, command: "contexts", contexts: expanded });
    return;
  }

  console.log("Contexts");
  console.log("========");
  for (const c of expanded) {
    const name = c.name ? ` (${c.name})` : "";
    console.log(`- ${c.slug}${name}: ${c.locations.join(", ")}`);
  }
}

function cmdContext(args: string[], json: boolean): void {
  const { db } = openDb();
  const sub = args[0] ?? "get";

  if (sub === "set") {
    const slug = args[1];
    if (!slug) throw new Error("Usage: context set <slug>");
    // Validate the context exists.
    getContextLocations(db, slug);
    setSetting(db, "current_context", slug);
    if (json) printJson({ ok: true, command: "context", action: "set", context: slug });
    else console.log(`Current context set to ${slug}`);
    return;
  }

  if (sub === "get") {
    const value = getSetting(db, "current_context");
    if (json) printJson({ ok: true, command: "context", context: value });
    else console.log(value ? value : "(not set)");
    return;
  }

  throw new Error("Usage: context get | context set <slug>");
}

function cmdImport(args: string[], json: boolean): void {
  const kind = args[0];
  const filePath = args[1];
  if (!kind || !filePath) throw new Error("Usage: import <cards|locations|contexts|context-locations> <file>");

  const { db } = openDb();
  let res: any;

  if (kind === "cards") res = importCardsFromFile(db, filePath);
  else if (kind === "locations") res = importLocationsFromFile(db, filePath);
  else if (kind === "contexts") res = importContextsFromFile(db, filePath);
  else if (kind === "context-locations") res = importContextLocationsFromFile(db, filePath);
  else throw new Error(`Unknown import kind: ${kind}`);

  if (json) printJson({ ok: true, command: "import", kind, file: filePath, ...res });
  else console.log(`Imported ${kind} from ${filePath}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Module system (plugin-like practice history + completion tracking)
// ─────────────────────────────────────────────────────────────────────────────

type PracticeStatus = "open" | "completed" | "partial" | "abandoned";
type PracticeCompletedStatus = Exclude<PracticeStatus, "open">;

interface ModuleCardSummary {
  id: number;
  key: string;
  activity: string;
  minutes: number;
  prompt: string | null;
  tags: string[];
}

interface PracticeCompletion {
  completed_at: string;
  completed_at_unix: number;
  status: PracticeCompletedStatus;
  parts: string[];
  note: string | null;
  module_slug: string | null;
}

interface PracticeSession {
  started_at: string;
  started_at_unix: number;
  event_key: string;
  card: ModuleCardSummary;
  status: PracticeStatus;
  completion: PracticeCompletion | null;
  commands: { redo: string; complete: string };
}

interface PracticeServedItem {
  served_at: string;
  served_at_unix: number;
  source: string;
  event_key: string | null;
  card: ModuleCardSummary;
  commands: { start: string };
}

function moduleCommandBase(moduleSlug: string): string {
  return `./site-toggle module ${moduleSlug}`;
}

function parseMetaJson(metaJson: string | null): Record<string, unknown> {
  if (!metaJson) return {};
  try {
    const parsed = JSON.parse(metaJson) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function sessionKey(eventKey: string, cardId: number): string {
  return `${eventKey}::${cardId}`;
}

function isPracticeCompletedStatus(value: string): value is PracticeCompletedStatus {
  return value === "completed" || value === "partial" || value === "abandoned";
}

function generateModuleEventKey(moduleSlug: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const rand = crypto.randomBytes(2).toString("hex");
  return `mod-${moduleSlug}-${ts}-${rand}`;
}

function generateTestEventKey(moduleSlug: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const rand = crypto.randomBytes(2).toString("hex");
  return `test-${moduleSlug}-${ts}-${rand}`;
}

function generateSuggestEventKey(): string {
  const ts = Math.floor(Date.now() / 1000);
  const rand = crypto.randomBytes(2).toString("hex");
  return `sug-${ts}-${rand}`;
}

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

function rowToModuleCard(row: {
  id: number;
  key: string;
  activity: string;
  minutes: number;
  prompt: string | null;
  tags_json: string;
}): ModuleCardSummary {
  return {
    id: row.id,
    key: row.key,
    activity: row.activity,
    minutes: row.minutes,
    prompt: row.prompt,
    tags: parseTagsJson(row.tags_json),
  };
}

function getCardByIdOrKey(db: any, idOrKey: string): (ModuleCardSummary & { tags_json: string; active: boolean }) | null {
  let row: any;
  if (/^\d+$/.test(idOrKey)) {
    row = db
      .prepare("SELECT id, key, activity, minutes, prompt, tags_json, active FROM cards WHERE id = ? LIMIT 1")
      .get(Number(idOrKey));
  } else {
    row = db
      .prepare("SELECT id, key, activity, minutes, prompt, tags_json, active FROM cards WHERE key = ? LIMIT 1")
      .get(idOrKey);
  }

  if (!row) return null;

  const card = rowToModuleCard(row);
  return { ...card, tags_json: String(row.tags_json ?? "[]"), active: Number(row.active ?? 0) === 1 };
}

function getLatestCompletionsBySession(db: any, sessions: Array<{ event_key: string; card_id: number }>): Map<string, PracticeCompletion> {
  const map = new Map<string, PracticeCompletion>();
  if (sessions.length === 0) return map;

  const clauses: string[] = [];
  const args: any[] = [];
  for (const s of sessions) {
    clauses.push("(event_key = ? AND card_id = ?)");
    args.push(s.event_key, s.card_id);
  }

  const rows = db
    .prepare(
      `SELECT id, created_at, CAST(strftime('%s', created_at) AS INTEGER) AS created_at_unix, event_key, card_id, meta_json
       FROM events
       WHERE type = 'practice_completed' AND (${clauses.join(" OR ")})
       ORDER BY id DESC`,
    )
    .all(...args) as Array<{
    id: number;
    created_at: string;
    created_at_unix: number;
    event_key: string | null;
    card_id: number | null;
    meta_json: string | null;
  }>;

  for (const r of rows) {
    const eventKey = r.event_key ? String(r.event_key) : "";
    const cardId = typeof r.card_id === "number" ? r.card_id : null;
    if (!eventKey || cardId === null) continue;
    const key = sessionKey(eventKey, cardId);
    if (map.has(key)) continue; // latest wins (rows are ordered DESC)

    const meta = parseMetaJson(r.meta_json);
    const statusRaw = typeof meta["status"] === "string" ? meta["status"] : "completed";
    const status = isPracticeCompletedStatus(statusRaw) ? statusRaw : "completed";

    const partsRaw = meta["parts"];
    const parts = Array.isArray(partsRaw) ? partsRaw.map(String).map((s) => s.trim()).filter(Boolean) : [];
    const note = typeof meta["note"] === "string" && meta["note"].trim() ? String(meta["note"]).trim() : null;
    const moduleSlug = typeof meta["module_slug"] === "string" && meta["module_slug"].trim() ? String(meta["module_slug"]).trim() : null;

    map.set(key, {
      completed_at: String(r.created_at),
      completed_at_unix: Number(r.created_at_unix),
      status,
      parts,
      note,
      module_slug: moduleSlug,
    });
  }

  return map;
}

function sessionBelongsToModule(module: ModuleDefinition, startedType: string, startedMetaJson: string | null): boolean {
  if (startedType !== "practice_started") return true; // Break sessions are shared pool (tag-based lens).
  const meta = parseMetaJson(startedMetaJson);
  const slug = typeof meta["module_slug"] === "string" ? meta["module_slug"].trim() : "";
  return slug === module.slug;
}

function findOpenSessions(db: any, module: ModuleDefinition, maxScan = 200): Array<{ started_at: string; started_at_unix: number; event_key: string; card: ModuleCardSummary }> {
  const rows = db
    .prepare(
      `SELECT e.id, e.type, e.created_at,
              CAST(strftime('%s', e.created_at) AS INTEGER) AS created_at_unix,
              e.event_key, e.card_id, e.meta_json,
              c.key AS card_key, c.activity AS card_activity, c.minutes AS card_minutes, c.prompt AS card_prompt, c.tags_json AS card_tags_json
       FROM events e
       JOIN cards c ON c.id = e.card_id
       WHERE e.type IN ('card_chosen', 'practice_started') AND e.card_id IS NOT NULL
       ORDER BY e.id DESC
       LIMIT ?`,
    )
    .all(maxScan) as Array<any>;

  const candidates: Array<{ started_at: string; started_at_unix: number; event_key: string; card_id: number }> = [];
  const cardsByKey = new Map<string, ModuleCardSummary>();

  for (const r of rows) {
    const eventKey = r.event_key ? String(r.event_key) : "";
    const cardId = typeof r.card_id === "number" ? r.card_id : null;
    if (!eventKey || cardId === null) continue;
    if (!sessionBelongsToModule(module, String(r.type), r.meta_json ?? null)) continue;

    const card = rowToModuleCard({
      id: cardId,
      key: String(r.card_key),
      activity: String(r.card_activity),
      minutes: Number(r.card_minutes),
      prompt: (r.card_prompt ?? null) as string | null,
      tags_json: String(r.card_tags_json ?? "[]"),
    });

    if (!moduleMatchesTags(module, card.tags)) continue;

    candidates.push({ started_at: String(r.created_at), started_at_unix: Number(r.created_at_unix), event_key: eventKey, card_id: cardId });
    cardsByKey.set(sessionKey(eventKey, cardId), card);
  }

  const completions = getLatestCompletionsBySession(
    db,
    candidates.map((c) => ({ event_key: c.event_key, card_id: c.card_id })),
  );

  const open: Array<{ started_at: string; started_at_unix: number; event_key: string; card: ModuleCardSummary }> = [];
  for (const c of candidates) {
    const key = sessionKey(c.event_key, c.card_id);
    if (completions.has(key)) continue;
    const card = cardsByKey.get(key);
    if (!card) continue;
    open.push({ started_at: c.started_at, started_at_unix: c.started_at_unix, event_key: c.event_key, card });
  }

  return open;
}

function cmdModules(json: boolean): void {
  const modules = loadModules();
  if (json) {
    printJson({
      ok: true,
      command: "modules",
      modules: modules.map((m) => ({ slug: m.slug, name: m.name, match: m.match, completion: m.completion ?? null })),
    });
    return;
  }

  if (modules.length === 0) {
    console.log("No modules defined.");
    console.log(`Create JSON files under: ${modulesDirPath()}`);
    return;
  }

  console.log("Modules");
  console.log("=======");
  for (const m of modules) {
    const tags = m.match.tags_any.join(", ");
    console.log(`- ${m.slug}: ${m.name} (tags_any: ${tags})`);
  }
}

async function cmdModule(args: string[], json: boolean): Promise<void> {
  const moduleSlug = args[0];
  const action = args[1] ?? "history";
  if (!moduleSlug || isHelpToken(moduleSlug)) {
    printModuleHelp(json);
    return;
  }
  if (isHelpToken(action)) {
    printModuleHelp(json, moduleSlug);
    return;
  }

  const moduleDef = findModuleOrThrow(moduleSlug);
  const actionArgs = args.slice(2);

  if (actionArgs.length > 0 && isHelpToken(actionArgs[0])) {
    printModuleActionHelp(json, moduleDef.slug, action);
    return;
  }

  if (action === "history") return cmdModuleHistory(moduleDef, actionArgs, json);
  if (action === "start") return cmdModuleStart(moduleDef, actionArgs, json);
  if (action === "complete") return cmdModuleComplete(moduleDef, actionArgs, json);
  if (action === "resume") return cmdModuleResume(moduleDef, actionArgs, json);
  if (action === "last") return cmdModuleLast(moduleDef, actionArgs, json);
  if (action === "srs") return cmdModuleSrs(moduleDef, actionArgs, json);
  if (action === "test") return cmdModuleTest(moduleDef, actionArgs, json);
  if (action === "test-complete") return cmdModuleTestComplete(moduleDef, actionArgs, json);

  throw new Error(`Unknown module action: ${action}\nUsage: module <slug> <history|start|complete|resume|last|srs|test|test-complete>`);
}

function cmdModuleHistory(moduleDef: ModuleDefinition, args: string[], json: boolean): void {
  let days = 7;
  let limit = 10;
  let servedLimit = 10;
  let unique = false;
  let only: "sessions" | "served" | null = null;
  let status: PracticeStatus | null = null;

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (!a) continue;
    const next = args[i + 1];

    if (a === "--days" && next && /^\d+$/.test(next)) {
      days = Number(next);
      i += 1;
      continue;
    }
    if (a === "--limit" && next && /^\d+$/.test(next)) {
      limit = Number(next);
      i += 1;
      continue;
    }
    if (a === "--served-limit" && next && /^\d+$/.test(next)) {
      servedLimit = Number(next);
      i += 1;
      continue;
    }
    if (a === "--unique") {
      unique = true;
      continue;
    }
    if (a === "--only" && next) {
      if (next !== "sessions" && next !== "served") throw new Error("Usage: module <slug> history --only sessions|served");
      only = next;
      i += 1;
      continue;
    }
    if (a === "--status" && next) {
      if (!["open", "completed", "partial", "abandoned"].includes(next)) {
        throw new Error("Usage: module <slug> history --status open|completed|partial|abandoned");
      }
      status = next as PracticeStatus;
      i += 1;
      continue;
    }

    if (a.startsWith("--")) throw new Error(`Unknown flag: ${a}`);
  }

  const { db } = openDb();
  const sinceArg = `-${days} days`;

  // Collect sessions (started practices)
  const sessionsRaw: Array<{
    started_at: string;
    started_at_unix: number;
    event_key: string;
    card_id: number;
    started_type: string;
    started_meta_json: string | null;
    card: ModuleCardSummary;
  }> = [];

  const maxScan = 2000;
  const batchSize = 200;
  let scanned = 0;
  let beforeId: number | null = null;

  while (sessionsRaw.length < limit && scanned < maxScan) {
    const rows = db
      .prepare(
        `SELECT e.id, e.type, e.created_at,
                CAST(strftime('%s', e.created_at) AS INTEGER) AS created_at_unix,
                e.event_key, e.card_id, e.meta_json,
                c.key AS card_key, c.activity AS card_activity, c.minutes AS card_minutes, c.prompt AS card_prompt, c.tags_json AS card_tags_json
         FROM events e
         JOIN cards c ON c.id = e.card_id
         WHERE e.type IN ('card_chosen', 'practice_started')
           AND e.card_id IS NOT NULL
           AND e.created_at >= datetime('now', ?)
           ${beforeId ? "AND e.id < ?" : ""}
         ORDER BY e.id DESC
         LIMIT ?`,
      )
      .all(...(beforeId ? [sinceArg, beforeId, batchSize] : [sinceArg, batchSize])) as Array<any>;

    if (rows.length === 0) break;
    scanned += rows.length;
    beforeId = Number(rows[rows.length - 1].id);

    for (const r of rows) {
      const eventKey = r.event_key ? String(r.event_key) : "";
      const cardId = typeof r.card_id === "number" ? r.card_id : null;
      if (!eventKey || cardId === null) continue;

      const startedType = String(r.type);
      const startedMetaJson = (r.meta_json ?? null) as string | null;
      if (!sessionBelongsToModule(moduleDef, startedType, startedMetaJson)) continue;

      const card = rowToModuleCard({
        id: cardId,
        key: String(r.card_key),
        activity: String(r.card_activity),
        minutes: Number(r.card_minutes),
        prompt: (r.card_prompt ?? null) as string | null,
        tags_json: String(r.card_tags_json ?? "[]"),
      });
      if (!moduleMatchesTags(moduleDef, card.tags)) continue;

      sessionsRaw.push({
        started_at: String(r.created_at),
        started_at_unix: Number(r.created_at_unix),
        event_key: eventKey,
        card_id: cardId,
        started_type: startedType,
        started_meta_json: startedMetaJson,
        card,
      });

      if (sessionsRaw.length >= limit) break;
    }
  }

  const completionMap = getLatestCompletionsBySession(
    db,
    sessionsRaw.map((s) => ({ event_key: s.event_key, card_id: s.card_id })),
  );

  const sessionsWithStatus: PracticeSession[] = sessionsRaw
    .map((s) => {
      const completion = completionMap.get(sessionKey(s.event_key, s.card_id)) ?? null;
      const derivedStatus: PracticeStatus = completion ? completion.status : "open";
      return {
        started_at: s.started_at,
        started_at_unix: s.started_at_unix,
        event_key: s.event_key,
        card: s.card,
        status: derivedStatus,
        completion,
        commands: {
          redo: `${moduleCommandBase(moduleDef.slug)} start ${s.card.id}`,
          complete: `${moduleCommandBase(moduleDef.slug)} complete --event-key ${s.event_key} --card-id ${s.card.id} --status completed`,
        },
      };
    })
    .filter((s) => (status ? s.status === status : true));

  const sessionsOut: any[] = unique
    ? (() => {
        const agg = new Map<number, any>();
        for (const s of sessionsWithStatus) {
          const existing = agg.get(s.card.id);
          if (!existing) {
            agg.set(s.card.id, {
              card: s.card,
              count: 1,
              last_started_at: s.started_at,
              last_started_at_unix: s.started_at_unix,
              last_status: s.status,
              last_completion: s.completion,
              commands: {
                redo: `${moduleCommandBase(moduleDef.slug)} start ${s.card.id}`,
              },
            });
          } else {
            existing.count += 1;
          }
        }
        return Array.from(agg.values());
      })()
    : sessionsWithStatus;

  // Collect served items (offered but not started in that same event_key session)
  const servedRaw: PracticeServedItem[] = [];
  if (only !== "sessions") {
    scanned = 0;
    beforeId = null;
    while (servedRaw.length < servedLimit && scanned < maxScan) {
      const rows = db
        .prepare(
          `SELECT e.id, e.created_at,
                  CAST(strftime('%s', e.created_at) AS INTEGER) AS created_at_unix,
                  e.event_key, e.card_id, e.meta_json,
                  c.key AS card_key, c.activity AS card_activity, c.minutes AS card_minutes, c.prompt AS card_prompt, c.tags_json AS card_tags_json
           FROM events e
           JOIN cards c ON c.id = e.card_id
           WHERE e.type = 'card_served'
             AND e.card_id IS NOT NULL
             AND e.created_at >= datetime('now', ?)
             ${beforeId ? "AND e.id < ?" : ""}
           ORDER BY e.id DESC
           LIMIT ?`,
        )
        .all(...(beforeId ? [sinceArg, beforeId, batchSize] : [sinceArg, batchSize])) as Array<any>;

      if (rows.length === 0) break;
      scanned += rows.length;
      beforeId = Number(rows[rows.length - 1].id);

      for (const r of rows) {
        const eventKey = r.event_key ? String(r.event_key) : null;
        const cardId = typeof r.card_id === "number" ? r.card_id : null;
        if (cardId === null) continue;

        const card = rowToModuleCard({
          id: cardId,
          key: String(r.card_key),
          activity: String(r.card_activity),
          minutes: Number(r.card_minutes),
          prompt: (r.card_prompt ?? null) as string | null,
          tags_json: String(r.card_tags_json ?? "[]"),
        });
        if (!moduleMatchesTags(moduleDef, card.tags)) continue;

        // Deduplicate accurately: if this served card was started (same event_key + card_id), don't show it as "served-only".
        // Note: don't rely on the sessions list because it may be limited/filtered.
        if (eventKey) {
          const started = db
            .prepare(
              `SELECT 1
               FROM events
               WHERE event_key = ? AND card_id = ? AND type IN ('card_chosen', 'practice_started')
               LIMIT 1`,
            )
            .get(eventKey, cardId);
          if (started) continue;
        }

        const meta = parseMetaJson(r.meta_json ?? null);
        const source = typeof meta["source"] === "string" && meta["source"].trim() ? String(meta["source"]).trim() : "unknown";

        servedRaw.push({
          served_at: String(r.created_at),
          served_at_unix: Number(r.created_at_unix),
          source,
          event_key: eventKey,
          card,
          commands: {
            start: `${moduleCommandBase(moduleDef.slug)} start ${card.id}`,
          },
        });
        if (servedRaw.length >= servedLimit) break;
      }
    }
  }

  const servedOut: any[] = unique
    ? (() => {
        const agg = new Map<number, any>();
        for (const s of servedRaw) {
          const existing = agg.get(s.card.id);
          if (!existing) {
            agg.set(s.card.id, {
              card: s.card,
              count: 1,
              last_served_at: s.served_at,
              last_served_at_unix: s.served_at_unix,
              sources: [s.source],
              commands: { start: `${moduleCommandBase(moduleDef.slug)} start ${s.card.id}` },
            });
          } else {
            existing.count += 1;
            if (!existing.sources.includes(s.source)) existing.sources.push(s.source);
          }
        }
        return Array.from(agg.values());
      })()
    : servedRaw;

  if (json) {
    printJson({
      ok: true,
      command: "module",
      module: { slug: moduleDef.slug, name: moduleDef.name },
      action: "history",
      options: { days, limit, served_limit: servedLimit, unique, only, status },
      sessions: only === "served" ? [] : sessionsOut,
      served: only === "sessions" ? [] : servedOut,
    });
    return;
  }

  console.log(`Module: ${moduleDef.slug} (${moduleDef.name})`);
  console.log(`Window: last ${days} day(s)`);
  console.log("");

  if (only !== "served") {
    console.log("Sessions");
    console.log("--------");
    if (sessionsOut.length === 0) console.log("(none)");
    for (const s of sessionsOut) {
      if (unique) {
        console.log(`- ${s.card.activity} (${s.count}x) — last: ${s.last_started_at} [${s.last_status}]`);
      } else {
        const suffix = s.status === "open" ? "open" : s.status;
        console.log(`- ${s.started_at} — ${s.card.activity} [${suffix}]`);
      }
    }
    console.log("");
  }

  if (only !== "sessions") {
    console.log("Served");
    console.log("------");
    if (servedOut.length === 0) console.log("(none)");
    for (const s of servedOut) {
      if (unique) {
        console.log(`- ${s.card.activity} (${s.count}x) — last: ${s.last_served_at} (sources: ${s.sources.join(", ")})`);
      } else {
        console.log(`- ${s.served_at} — ${s.card.activity} (source: ${s.source})`);
      }
    }
  }
}

function cmdModuleSrs(moduleDef: ModuleDefinition, args: string[], json: boolean): void {
  if (moduleDef.slug !== "spanish") throw new Error('SRS is only supported for module "spanish".');

  if (args.length > 0 && isHelpToken(args[0])) {
    printModuleActionHelp(json, moduleDef.slug, "srs");
    return;
  }

  const { db } = openDb();
  try {
    const nowUnix = Math.floor(Date.now() / 1000);
    const lanes = ["verb", "noun", "lesson"] as const;
    type Lane = (typeof lanes)[number];

    const lanesOut: Record<Lane, { total: number; due_now: number }> = {
      verb: { total: 0, due_now: 0 },
      noun: { total: 0, due_now: 0 },
      lesson: { total: 0, due_now: 0 },
    };
    const dueSample: Array<{ card_id: number; card_key: string; lane: string; box: number; due_at_unix: number }> = [];

    for (const lane of lanes) {
      lanesOut[lane] = {
        total: countSrsCards(db, { moduleSlug: moduleDef.slug, lane }),
        due_now: countDueSrsCards(db, { moduleSlug: moduleDef.slug, lane, nowUnix }),
      };
      dueSample.push(...listDueSrsCards(db, { moduleSlug: moduleDef.slug, lane, nowUnix, limit: 10 }));
    }

    dueSample.sort((a, b) => a.due_at_unix - b.due_at_unix || a.card_id - b.card_id);

    if (json) {
      printJson({
        ok: true,
        command: "module",
        module: { slug: moduleDef.slug, name: moduleDef.name },
        action: "srs",
        now_unix: nowUnix,
        lanes: lanesOut,
        sample_due: dueSample.slice(0, 10),
      });
      return;
    }

    console.log(`Module: ${moduleDef.slug} (${moduleDef.name})`);
    console.log(`Now: ${nowUnix}`);
    console.log("");
    console.log("SRS lanes:");
    for (const lane of lanes) {
      const s = lanesOut[lane];
      console.log(`- ${lane}: total=${s.total} due_now=${s.due_now}`);
    }

    const sample = dueSample.slice(0, 10);
    if (sample.length > 0) {
      console.log("");
      console.log("Sample due:");
      for (const r of sample) {
        console.log(`- [${r.card_id}] ${r.card_key} (${r.lane}) box=${r.box} due_at_unix=${r.due_at_unix}`);
      }
    }
  } finally {
    db.close();
  }
}

function cmdModuleStart(moduleDef: ModuleDefinition, args: string[], json: boolean): void {
  const idOrKey = args[0];
  if (!idOrKey) throw new Error("Usage: module <slug> start <card_id|card_key>");

  const { db } = openDb();
  const row = getCardByIdOrKey(db, idOrKey);
  if (!row) throw new Error(`Card not found: ${idOrKey}`);
  if (!row.active) throw new Error(`Card is inactive: ${row.key}`);

  const tags = parseTagsJson(row.tags_json);
  if (!moduleMatchesTags(moduleDef, tags)) {
    throw new Error(`Card ${row.id} does not belong to module "${moduleDef.slug}" (missing tags_any match).`);
  }

  const eventKey = generateModuleEventKey(moduleDef.slug);
  insertEvent(db, {
    type: "practice_started",
    eventKey,
    cardId: row.id,
    metaJson: JSON.stringify({ module_slug: moduleDef.slug, source: "module" }),
  });

  const card: ModuleCardSummary = { id: row.id, key: row.key, activity: row.activity, minutes: row.minutes, prompt: row.prompt, tags };

  if (json) {
    printJson({
      ok: true,
      command: "module",
      module: { slug: moduleDef.slug, name: moduleDef.name },
      action: "start",
      session: { event_key: eventKey, card },
    });
    return;
  }

  console.log(`Started session: ${eventKey}`);
  console.log(`Card: ${card.activity}`);
  if (card.prompt) printPromptBlock(card.prompt);
}

function cmdModuleComplete(moduleDef: ModuleDefinition, args: string[], json: boolean): void {
  let status: PracticeCompletedStatus | null = null;
  const parts: string[] = [];
  let note: string | null = null;
  let eventKey: string | null = null;
  let cardId: number | null = null;

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (!a) continue;
    const next = args[i + 1];

    if (a === "--status" && next) {
      if (!isPracticeCompletedStatus(next)) throw new Error("Usage: module <slug> complete --status completed|partial|abandoned");
      status = next;
      i += 1;
      continue;
    }
    if (a === "--parts" && next) {
      const split = next.split(",").map((s) => s.trim()).filter(Boolean);
      parts.push(...split);
      i += 1;
      continue;
    }
    if (a === "--note" && next) {
      note = next.trim() ? next.trim() : null;
      i += 1;
      continue;
    }
    if (a === "--event-key" && next) {
      eventKey = next;
      i += 1;
      continue;
    }
    if (a === "--card-id" && next && /^\d+$/.test(next)) {
      cardId = Number(next);
      i += 1;
      continue;
    }

    if (a.startsWith("--")) throw new Error(`Unknown flag: ${a}`);
  }

  if (!status) throw new Error("Usage: module <slug> complete --status completed|partial|abandoned [--parts ...] [--note ...]");
  if ((eventKey && cardId === null) || (!eventKey && cardId !== null)) {
    throw new Error("Usage: module <slug> complete [--event-key <k> --card-id <id>]");
  }

  const { db } = openDb();

  if (!eventKey || cardId === null) {
    const open = findOpenSessions(db, moduleDef, 400);
    if (open.length === 0) {
      throw new Error(`No open sessions to complete for module "${moduleDef.slug}". Try: ${moduleCommandBase(moduleDef.slug)} last`);
    }
    if (open.length > 1) {
      const preview = open.slice(0, 5).map((s) => `- ${s.started_at} | ${s.event_key} | ${s.card.id} | ${s.card.activity}`);
      throw new Error(
        `Multiple open sessions found for module "${moduleDef.slug}". Specify which to complete:\n` +
          `${moduleCommandBase(moduleDef.slug)} complete --event-key <event_key> --card-id <card_id> --status ${status}\n\n` +
          `Open sessions:\n${preview.join("\n")}`,
      );
    }
    const onlySession = open[0];
    if (!onlySession) throw new Error("Invariant: expected exactly one open session");
    eventKey = onlySession.event_key;
    cardId = onlySession.card.id;
  }

  // Validate started session exists (started-only).
  const started = db
    .prepare(
      `SELECT e.type, e.meta_json,
              c.key AS card_key, c.activity AS card_activity, c.minutes AS card_minutes, c.prompt AS card_prompt, c.tags_json AS card_tags_json
       FROM events e
       JOIN cards c ON c.id = e.card_id
       WHERE e.event_key = ? AND e.card_id = ? AND e.type IN ('card_chosen', 'practice_started')
       ORDER BY e.id DESC
       LIMIT 1`,
    )
    .get(eventKey, cardId) as any;

  if (!started) throw new Error(`Session not found (or not started): event_key=${eventKey} card_id=${cardId}`);
  if (!sessionBelongsToModule(moduleDef, String(started.type), started.meta_json ?? null)) {
    throw new Error(`Session belongs to a different module (module_slug mismatch).`);
  }

  const card = rowToModuleCard({
    id: Number(cardId),
    key: String(started.card_key),
    activity: String(started.card_activity),
    minutes: Number(started.card_minutes),
    prompt: (started.card_prompt ?? null) as string | null,
    tags_json: String(started.card_tags_json ?? "[]"),
  });
  if (!moduleMatchesTags(moduleDef, card.tags)) {
    throw new Error(`Card ${card.id} does not belong to module "${moduleDef.slug}".`);
  }

  insertEvent(db, {
    type: "practice_completed",
    eventKey,
    cardId: Number(cardId),
    metaJson: JSON.stringify({ module_slug: moduleDef.slug, status, parts, note }),
  });

  if (json) {
    printJson({
      ok: true,
      command: "module",
      module: { slug: moduleDef.slug, name: moduleDef.name },
      action: "complete",
      session: { event_key: eventKey, card_id: Number(cardId), status, parts, note },
    });
    return;
  }

  console.log(`Completed: ${moduleDef.slug} (${status})`);
  console.log(`Session: ${eventKey}`);
  console.log(`Card: ${card.activity}`);
}

function cmdModuleResume(moduleDef: ModuleDefinition, _args: string[], json: boolean): void {
  const { db } = openDb();
  const open = findOpenSessions(db, moduleDef, 400);
  if (open.length === 0) {
    throw new Error(`No open sessions to resume for module "${moduleDef.slug}". Try: ${moduleCommandBase(moduleDef.slug)} last`);
  }

  const session = open[0];
  if (!session) throw new Error("Invariant: expected an open session");

  if (json) {
    printJson({
      ok: true,
      command: "module",
      module: { slug: moduleDef.slug, name: moduleDef.name },
      action: "resume",
      session: { event_key: session.event_key, started_at: session.started_at, started_at_unix: session.started_at_unix, card: session.card },
    });
    return;
  }

  console.log(`Resume: ${moduleDef.slug}`);
  console.log(`Session: ${session.event_key}`);
  console.log(`Started: ${session.started_at}`);
  console.log(`Card: ${session.card.activity}`);
  if (session.card.prompt) printPromptBlock(session.card.prompt);
}

function cmdModuleLast(moduleDef: ModuleDefinition, _args: string[], json: boolean): void {
  const { db } = openDb();

  // `last` prefers completed/partial sessions because `resume` is the explicit tool for open sessions.
  const rows = db
    .prepare(
      `SELECT e.id, e.type, e.created_at,
              CAST(strftime('%s', e.created_at) AS INTEGER) AS created_at_unix,
              e.event_key, e.card_id, e.meta_json,
              c.key AS card_key, c.activity AS card_activity, c.minutes AS card_minutes, c.prompt AS card_prompt, c.tags_json AS card_tags_json
       FROM events e
       JOIN cards c ON c.id = e.card_id
       WHERE e.type IN ('card_chosen', 'practice_started') AND e.card_id IS NOT NULL
       ORDER BY e.id DESC
      LIMIT 400`,
    )
    .all() as Array<any>;

  const candidates: Array<{ event_key: string; card_id: number; card: ModuleCardSummary }> = [];

  for (const r of rows) {
    const eventKey = r.event_key ? String(r.event_key) : "";
    const cardId = typeof r.card_id === "number" ? r.card_id : null;
    if (!eventKey || cardId === null) continue;
    if (!sessionBelongsToModule(moduleDef, String(r.type), r.meta_json ?? null)) continue;

    const card = rowToModuleCard({
      id: cardId,
      key: String(r.card_key),
      activity: String(r.card_activity),
      minutes: Number(r.card_minutes),
      prompt: (r.card_prompt ?? null) as string | null,
      tags_json: String(r.card_tags_json ?? "[]"),
    });
    if (!moduleMatchesTags(moduleDef, card.tags)) continue;

    candidates.push({ event_key: eventKey, card_id: cardId, card });
  }

  const completionMap = getLatestCompletionsBySession(
    db,
    candidates.map((c) => ({ event_key: c.event_key, card_id: c.card_id })),
  );

  let bestCompleted: { event_key: string; card_id: number; card: ModuleCardSummary } | null = null;
  for (const c of candidates) {
    if (completionMap.has(sessionKey(c.event_key, c.card_id))) {
      bestCompleted = c;
      break;
    }
  }

  const bestOpen = candidates[0] ?? null;
  const chosen = bestCompleted ?? bestOpen;
  if (!chosen) throw new Error(`No practice history found for module "${moduleDef.slug}". Try starting one with: ${moduleCommandBase(moduleDef.slug)} start <card_id>`);

  const newEventKey = generateModuleEventKey(moduleDef.slug);
  insertEvent(db, {
    type: "practice_started",
    eventKey: newEventKey,
    cardId: chosen.card.id,
    metaJson: JSON.stringify({ module_slug: moduleDef.slug, source: "module_last", previous_event_key: chosen.event_key }),
  });

  if (json) {
    printJson({
      ok: true,
      command: "module",
      module: { slug: moduleDef.slug, name: moduleDef.name },
      action: "last",
      session: { event_key: newEventKey, card: chosen.card },
    });
    return;
  }

  console.log(`Redo (new attempt): ${moduleDef.slug}`);
  console.log(`Session: ${newEventKey}`);
  console.log(`Card: ${chosen.card.activity}`);
  if (chosen.card.prompt) printPromptBlock(chosen.card.prompt);
}

function cmdModuleTest(moduleDef: ModuleDefinition, args: string[], json: boolean): void {
  let count = 20;
  let days: number | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (!a) continue;
    const next = args[i + 1];

    if (a === "--count" && next && /^\d+$/.test(next)) {
      count = Number(next);
      i += 1;
      continue;
    }
    if (a === "--days" && next && /^\d+$/.test(next)) {
      days = Number(next);
      i += 1;
      continue;
    }

    if (a.startsWith("--")) throw new Error(`Unknown flag: ${a}`);
  }

  if (moduleDef.slug !== "spanish") throw new Error('Test mode is only supported for module "spanish".');

  const { db } = openDb();
  const allVerbs = getCompletedSpanishVerbCards(db, { days });

  const effectiveCount = Math.min(count, allVerbs.length);
  const shuffled = shuffleInPlace([...allVerbs]);
  const poolLimit = Math.min(shuffled.length, effectiveCount);
  const verbPool = shuffled.slice(0, poolLimit);
  const tenses = ["presente", "indefinido", "imperfecto"] as const;
  const persons = ["yo", "tu", "el/ella", "nosotros", "vosotros", "ellos/ellas"] as const;

  const eventKey = generateTestEventKey(moduleDef.slug);
  insertEvent(db, {
    type: "test_started",
    eventKey,
    metaJson: JSON.stringify({
      module_slug: moduleDef.slug,
      question_count: effectiveCount,
      verb_count: verbPool.length,
      verb_total: allVerbs.length,
      days: days ?? null,
    }),
  });

  if (json) {
    printJson({
      ok: true,
      command: "module",
      module: { slug: moduleDef.slug, name: moduleDef.name },
      action: "test",
      event_key: eventKey,
      test: {
        question_count: effectiveCount,
        tenses,
        verb_pool_total: allVerbs.length,
        verb_pool_limit: verbPool.length,
        verb_pool: verbPool.map((v) => ({
          card_id: v.cardId,
          card_key: v.cardKey,
          verb: v.verb,
          meaning: v.meaning,
          verb_type: v.verbType,
          tense: tenses[crypto.randomInt(0, tenses.length)],
          person: persons[crypto.randomInt(0, persons.length)],
          tags: v.tags,
          completed_count: v.completedCount,
          last_completed_at: v.lastCompletedAt,
        })),
      },
    });
    return;
  }

  console.log(`Spanish test ready: ${verbPool.length} completed verbs.`);
  console.log(`Event key: ${eventKey}`);
}

function cmdModuleTestComplete(moduleDef: ModuleDefinition, args: string[], json: boolean): void {
  const eventKey = args[0];
  if (!eventKey) {
    throw new Error("Usage: module <slug> test-complete <event_key> --score <n> --total <n> [--duration-seconds <n>]");
  }

  let score: number | null = null;
  let total: number | null = null;
  let durationSeconds: number | null = null;

  for (let i = 1; i < args.length; i += 1) {
    const a = args[i];
    if (!a) continue;
    const next = args[i + 1];

    if (a === "--score" && next && /^\d+$/.test(next)) {
      score = Number(next);
      i += 1;
      continue;
    }
    if (a === "--total" && next && /^\d+$/.test(next)) {
      total = Number(next);
      i += 1;
      continue;
    }
    if (a === "--duration-seconds" && next && /^\d+$/.test(next)) {
      durationSeconds = Number(next);
      i += 1;
      continue;
    }

    if (a.startsWith("--")) throw new Error(`Unknown flag: ${a}`);
  }

  if (score === null || total === null) {
    throw new Error("Usage: module <slug> test-complete <event_key> --score <n> --total <n> [--duration-seconds <n>]");
  }

  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;

  const { db } = openDb();
  insertEvent(db, {
    type: "test_completed",
    eventKey,
    metaJson: JSON.stringify({
      module_slug: moduleDef.slug,
      score,
      total,
      percentage,
      duration_seconds: durationSeconds,
    }),
  });

  if (json) {
    printJson({
      ok: true,
      command: "module",
      module: { slug: moduleDef.slug, name: moduleDef.name },
      action: "test-complete",
      event_key: eventKey,
      score,
      total,
      percentage,
      duration_seconds: durationSeconds,
    });
    return;
  }

  console.log(`Test completed: ${score}/${total} (${percentage}%)`);
}

function cmdChoose(args: string[], json: boolean): void {
  const { db } = openDb();

  let eventKey: string | null = null;
  let lane: string | null = null;

  if (args.length >= 2) {
    eventKey = args[0] ?? null;
    lane = args[1] ?? null;
  } else if (args.length === 1) {
    lane = args[0] ?? null;
    eventKey = findMostRecentOpenBreakEventKey(db);
  }

  if (!eventKey) throw new Error("No break event found. Run `site-toggle break <site>` first.");
  if (!lane) throw new Error("Usage: choose <event_key> <lane>");

  const served = getBreakServedEvent(db, eventKey);
  if (!served?.meta_json) throw new Error(`Could not find break menu for ${eventKey}`);
  const menu = JSON.parse(served.meta_json) as any;

  insertEvent(db, { type: "break_chosen", eventKey, siteSlug: menu.site, metaJson: JSON.stringify({ lane }) });

  if (lane === "feed") {
    requireRootFor("choose feed");
    const feedLane = (menu.lanes as any[]).find((l) => l.type === "feed");
    if (!feedLane) throw new Error("Break menu missing feed lane");
    let hosts = readHostsFile();
    const res = unblockSiteInHosts(db, hosts, String(menu.site), Number(feedLane.minutes), "break");
    hosts = res.hosts;
    writeHostsAndFlush(hosts);
    if (json) {
      printJson({ ok: true, command: "choose", event_key: eventKey, lane: "feed", site: menu.site, minutes: Number(feedLane.minutes), timer_pid: res.pid });
      return;
    }
    console.log(`Unblocked ${menu.site} for ${feedLane.minutes} min (auto-reblock timer pid ${res.pid})`);
    return;
  }

  const isCardLaneType = (t: string): boolean => ["card", "card2", "physical", "verb", "noun", "lesson", "sovt", "acting", "fusion"].includes(t);

  const resolveCardLane = (requested: string): any | null => {
    const direct = (menu.lanes as any[]).find((l) => l.type === requested);
    if (direct?.card?.id) return direct;

    // Backwards-compatible aliases:
    // - If the menu is "v2" (physical/verb/noun/lesson), allow `card`/`card2`
    //   to mean the 1st/2nd available card lane in the menu order.
    if (requested === "card" || requested === "card2") {
      const allCardLanes = (menu.lanes as any[]).filter((l) => l?.card?.id);
      const idx = requested === "card" ? 0 : 1;
      return allCardLanes[idx] ?? null;
    }

    return null;
  };

  if (isCardLaneType(lane)) {
    const cardLane = resolveCardLane(lane);
    if (!cardLane?.card?.id) {
      const available = Array.isArray(menu?.lanes) ? (menu.lanes as any[]).map((l) => l.type).join(", ") : "";
      throw new Error(`Break menu missing ${lane} lane.${available ? ` Available: ${available}` : ""}`);
    }

    const resolvedLane = String(cardLane.type);
    insertEvent(db, { type: "card_chosen", eventKey, siteSlug: menu.site, cardId: cardLane.card.id, metaJson: JSON.stringify({ lane: resolvedLane }) });
    notify("Break Card", `Do: ${cardLane.card.activity} (${cardLane.card.minutes} min)`);
    const reentryPid = spawnDetached([siteToggleJsPath(), "_reentry", eventKey, String(cardLane.card.minutes), String(cardLane.card.id)]);
    if (json) {
      printJson({ ok: true, command: "choose", event_key: eventKey, lane: resolvedLane, card: cardLane.card, card_id: cardLane.card.id, reentry_pid: reentryPid });
      return;
    }
    console.log(`Do: ${cardLane.card.activity} (${cardLane.card.minutes} min) — ${cardLane.card.doneCondition}`);
    if (cardLane.card.prompt) printPromptBlock(cardLane.card.prompt);
    console.log(`Re-entry prompt scheduled in ${cardLane.card.minutes} min (pid ${reentryPid})`);
    console.log(`When done: site-toggle rate ${cardLane.card.id} love|ok|meh|ban (optional)`);
    return;
  }

  if (lane === "same_need") {
    const same = (menu.lanes as any[]).find((l) => l.type === "same_need");
    insertEvent(db, { type: "same_need_chosen", eventKey, siteSlug: menu.site });
    if (json) {
      printJson({ ok: true, command: "choose", event_key: eventKey, lane: "same_need", prompt: same?.prompt ?? "" });
      return;
    }
    console.log(same?.prompt ?? "What are you hoping to find?");
    return;
  }

  throw new Error(`Unknown lane: ${lane}`);
}

function cmdRate(args: string[], json: boolean): void {
  const cardIdRaw = args[0];
  const rating = args[1] as any;
  if (!cardIdRaw || !/^\d+$/.test(cardIdRaw)) throw new Error("Usage: rate <card_id> <love|ok|meh|ban>");
  if (!["love", "ok", "meh", "ban"].includes(rating)) throw new Error("Rating must be love|ok|meh|ban");

  const cardId = Number(cardIdRaw);
  const { db } = openDb();
  setCardRating(db, cardId, rating);
  insertEvent(db, { type: "card_rated", cardId, metaJson: JSON.stringify({ rating }) });

  if (json) {
    printJson({ ok: true, command: "rate", card_id: cardId, rating });
    return;
  }
  console.log(`Rated card ${cardId}: ${rating}`);
}

function cmdStats(json: boolean): void {
  const { db } = openDb();

  const today = execFileSync("date", ["+%Y-%m-%d"], { encoding: "utf8" }).trim();
  const todayRow = db
    .prepare(
      `SELECT COUNT(*) as count, COALESCE(SUM(minutes), 0) as minutes
       FROM events
       WHERE type='unblock' AND date(created_at) = date('now')`,
    )
    .get() as { count: number; minutes: number };

  const bySite = db
    .prepare(
      `SELECT COALESCE(site_slug, 'unknown') as site, COUNT(*) as count, COALESCE(SUM(minutes),0) as minutes
       FROM events
       WHERE type='unblock' AND date(created_at) = date('now')
       GROUP BY site
       ORDER BY site`,
    )
    .all() as Array<{ site: string; count: number; minutes: number }>;

  const recent = db
    .prepare(
      `SELECT created_at, COALESCE(site_slug, 'unknown') as site, COALESCE(minutes, 0) as minutes
       FROM events
       WHERE type='unblock'
       ORDER BY id DESC
       LIMIT 5`,
    )
    .all() as Array<{ created_at: string; site: string; minutes: number }>;

  if (json) {
    printJson({
      ok: true,
      command: "stats",
      today,
      today_unblocks: todayRow.count,
      today_minutes: todayRow.minutes,
      by_site: bySite,
      recent,
    });
    return;
  }

  console.log("Usage Statistics");
  console.log("================");
  console.log("");
  console.log(`Today (${today}):`);
  console.log(`  Unblocks: ${todayRow.count}`);
  console.log(`  Total minutes requested: ${todayRow.minutes}`);
  console.log("");
  if (todayRow.count > 0) {
    console.log("  By site:");
    for (const s of bySite) console.log(`    ${s.site}: ${s.count} unblocks, ${s.minutes} min`);
    console.log("");
  }
  console.log("Recent unblocks:");
  for (const r of recent) console.log(`  ${r.created_at} - ${r.site} (${r.minutes} min)`);
}

function cmdClearStats(json: boolean): void {
  const { db } = openDb();
  db.exec("DELETE FROM events");
  if (json) {
    printJson({ ok: true, command: "clear-stats" });
    return;
  }
  console.log("Usage statistics cleared.");
}

function cmdDaemonTick(json: boolean): void {
  requireRootFor("daemon tick");
  const { db } = openDb();
  const expired = getSitesWithExpiredUnblocks(db, nowUnix());
  if (expired.length === 0) {
    if (json) printJson({ ok: true, command: "daemon", action: "tick", expired: 0 });
    else console.log("No expired unblocks.");
    return;
  }

  let hosts = readHostsFile();
  const results: Array<{ site_id: number }> = [];
  for (const row of expired) {
    const site = db.prepare("SELECT id, slug FROM sites WHERE id = ? LIMIT 1").get(row.site_id) as { id: number; slug: string } | undefined;
    if (!site) continue;
    killTimer(site.slug);
    const domains = getDomainsForSiteId(db, site.id);
    hosts = blockDomains(hosts, domains);
    insertEvent(db, { type: "block", siteId: site.id, siteSlug: site.slug, metaJson: JSON.stringify({ source: "daemon" }) });
    setSiteUnblockedUntil(db, site.id, null);
    results.push({ site_id: site.id });
  }
  writeHostsAndFlush(hosts);

  if (json) printJson({ ok: true, command: "daemon", action: "tick", expired: results.length });
  else console.log(`Re-blocked ${results.length} site(s) from DB timers.`);
}

const DAEMON_LABEL = "com.circuitbreaker.timers";
const DAEMON_PLIST_PATH = `/Library/LaunchDaemons/${DAEMON_LABEL}.plist`;

function daemonPlistXml(): string {
  // Keep this minimal and robust. Runs as a LaunchDaemon (root) every 60s.
  // It calls the stable entrypoint `site-toggle` so upgrades don't require plist edits.
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${DAEMON_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/ryanpfister/Dev/circuit-breaker/site-toggle</string>
    <string>daemon</string>
    <string>tick</string>
    <string>--json</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>60</integer>
  <key>StandardOutPath</key>
  <string>/tmp/circuitbreaker-daemon.out.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/circuitbreaker-daemon.err.log</string>
</dict>
</plist>
`;
}

function launchctl(args: string[]): string {
  return execFileSync("launchctl", args, { encoding: "utf8" });
}

function cmdDaemonInstall(json: boolean): void {
  requireRootFor("daemon install");

  fs.writeFileSync(DAEMON_PLIST_PATH, daemonPlistXml(), "utf8");
  fs.chmodSync(DAEMON_PLIST_PATH, 0o644);
  try {
    execFileSync("chown", ["root:wheel", DAEMON_PLIST_PATH], { stdio: "ignore" });
  } catch {
    // ignore
  }

  // Prefer modern launchctl bootstrap/bootout; fall back to load/unload if needed.
  try {
    execFileSync("launchctl", ["bootout", "system", DAEMON_PLIST_PATH], { stdio: "ignore" });
  } catch {
    // ignore
  }

  try {
    execFileSync("launchctl", ["bootstrap", "system", DAEMON_PLIST_PATH], { stdio: "ignore" });
    execFileSync("launchctl", ["enable", `system/${DAEMON_LABEL}`], { stdio: "ignore" });
  } catch {
    try {
      execFileSync("launchctl", ["unload", DAEMON_PLIST_PATH], { stdio: "ignore" });
    } catch {
      // ignore
    }
    execFileSync("launchctl", ["load", DAEMON_PLIST_PATH], { stdio: "ignore" });
  }

  if (json) {
    printJson({ ok: true, command: "daemon", action: "install", label: DAEMON_LABEL, plist: DAEMON_PLIST_PATH });
    return;
  }
  console.log(`Installed launchd helper: ${DAEMON_LABEL}`);
  console.log(`Plist: ${DAEMON_PLIST_PATH}`);
}

function cmdDaemonUninstall(json: boolean): void {
  requireRootFor("daemon uninstall");

  try {
    execFileSync("launchctl", ["bootout", "system", DAEMON_PLIST_PATH], { stdio: "ignore" });
  } catch {
    try {
      execFileSync("launchctl", ["unload", DAEMON_PLIST_PATH], { stdio: "ignore" });
    } catch {
      // ignore
    }
  }

  try {
    fs.rmSync(DAEMON_PLIST_PATH, { force: true });
  } catch {
    // ignore
  }

  if (json) {
    printJson({ ok: true, command: "daemon", action: "uninstall", label: DAEMON_LABEL, plist: DAEMON_PLIST_PATH });
    return;
  }
  console.log(`Uninstalled launchd helper: ${DAEMON_LABEL}`);
}

function cmdDaemonStatus(json: boolean): void {
  // status can run without root, but launchctl print might be restricted; we try anyway.
  let output = "";
  let ok = true;
  try {
    output = launchctl(["print", `system/${DAEMON_LABEL}`]);
  } catch (e) {
    ok = false;
    output = e instanceof Error ? e.message : String(e);
  }

  if (json) {
    printJson({ ok, command: "daemon", action: "status", label: DAEMON_LABEL, plist: DAEMON_PLIST_PATH, output });
    return;
  }
  console.log(output.trim() ? output : `(no output)`);
}

function importUsageLogIfPresent(db: any): { imported: number } {
  const logPath = path.join(repoRootFromHere(), "usage.log");
  if (!fs.existsSync(logPath)) return { imported: 0 };
  const raw = fs.readFileSync(logPath, "utf8").trim();
  if (!raw) return { imported: 0 };

  const insert = db.prepare(
    `INSERT INTO events (created_at, type, site_slug, minutes, meta_json)
     VALUES (?, 'unblock', ?, ?, ?)`,
  );

  let imported = 0;
  for (const line of raw.split("\n")) {
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const [timestamp, site, minutesRaw] = parts;
    const minutes = Number(minutesRaw);
    if (!timestamp || !site || !Number.isFinite(minutes)) continue;

    // Avoid double-import by checking if there's already an event with that exact timestamp/site/minutes.
    const exists = db
      .prepare(
        `SELECT 1 FROM events
         WHERE type='unblock' AND created_at = ? AND site_slug = ? AND minutes = ?
         LIMIT 1`,
      )
      .get(timestamp, site, minutes);
    if (exists) continue;

    insert.run(timestamp, site, minutes, JSON.stringify({ source: "usage.log" }));
    imported += 1;
  }

  return { imported };
}

// ─────────────────────────────────────────────────────────────────────────────
// Spanish TTS (speak command)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_SPEAK_VOICE = "es-ES-AlvaroNeural";
const DEFAULT_SPEAK_RATE = "-25%";
const DEFAULT_LISTEN_VOICE = "es-ES-ElviraNeural";
const DEFAULT_EDGE_TTS_TIMEOUT_MS = 15_000;
const DEFAULT_PHONEME_MODEL = "facebook/wav2vec2-xlsr-53-espeak-cv-ft";

function speakCacheDir(): string {
  // Per-UID cache avoids permission issues if speak is ever run under sudo
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  return uid === null ? "/tmp/circuit-breaker-audio" : `/tmp/circuit-breaker-audio-${uid}`;
}

function phonemizeScriptPath(): string {
  return path.join(repoRootFromHere(), "packages", "cli", "scripts", "phonemize.py");
}

function normalizeSpeakText(input: string): string {
  return input.normalize("NFC").replace(/\s+/g, " ").trim();
}

function fileExistsNonEmpty(filePath: string): boolean {
  try {
    const st = fs.statSync(filePath);
    return st.isFile() && st.size > 0;
  } catch {
    return false;
  }
}

function pythonExecPath(): string {
  const override = (process.env["CIRCUIT_BREAKER_PYTHON"] ?? "").trim();
  if (override) {
    const resolved = path.resolve(override);
    if (!fileExistsNonEmpty(resolved)) {
      throw new Error(`CIRCUIT_BREAKER_PYTHON not found: ${resolved}`);
    }
    return resolved;
  }

  const repoRoot = repoRootFromHere();
  const candidates = [
    path.join(repoRoot, ".venv", "bin", "python3"),
    path.join(repoRoot, ".venv", "bin", "python"),
  ];
  for (const candidate of candidates) {
    if (fileExistsNonEmpty(candidate)) return candidate;
  }

  throw new Error(
    "Python venv not found. Create with: python3 -m venv .venv && .venv/bin/python -m pip install torch transformers numpy",
  );
}

function commandExists(command: string): boolean {
  try {
    execFileSync("which", [command], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function pythonModuleExists(pythonPath: string, moduleName: string): boolean {
  try {
    execFileSync(pythonPath, ["-c", `import ${moduleName}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function requireCommand(command: string, hint: string): void {
  if (commandExists(command)) return;
  throw new Error(`${command} not found. ${hint}`);
}

function hashBuffer(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function getWavDurationSeconds(wavPath: string): number {
  try {
    const out = execFileSync("sox", ["--i", "-D", wavPath], { encoding: "utf8" }).trim();
    const seconds = Number(out);
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("Invalid duration");
    return seconds;
  } catch (e) {
    throw new Error(`Failed to read duration for ${wavPath}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function getAudioDurationSeconds(audioPath: string): number {
  try {
    const out = execFileSync("sox", ["--i", "-D", audioPath], { encoding: "utf8" }).trim();
    const seconds = Number(out);
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("Invalid duration");
    return seconds;
  } catch (e) {
    throw new Error(`Failed to read duration for ${audioPath}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function getWavSampleRate(wavPath: string): number {
  try {
    const out = execFileSync("sox", ["--i", "-r", wavPath], { encoding: "utf8" }).trim();
    const rate = Number(out);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("Invalid sample rate");
    return rate;
  } catch (e) {
    throw new Error(`Failed to read sample rate for ${wavPath}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function getWavChannels(wavPath: string): number {
  try {
    const out = execFileSync("sox", ["--i", "-c", wavPath], { encoding: "utf8" }).trim();
    const channels = Number(out);
    if (!Number.isFinite(channels) || channels <= 0) throw new Error("Invalid channel count");
    return channels;
  } catch (e) {
    throw new Error(`Failed to read channel count for ${wavPath}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function getWavStats(wavPath: string): { max_amp: number; rms_amp: number; length_sec: number; raw: string } {
  const res = spawnSync("sox", [wavPath, "-n", "stat"], { encoding: "utf8" });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`sox stat failed: ${res.stderr || res.stdout || "unknown error"}`);
  }
  const output = `${res.stderr ?? ""}`.trim();
  const maxMatch = output.match(/Maximum amplitude:\s*([-\d.]+)/i);
  const rmsMatch = output.match(/RMS\s+amplitude:\s*([-\d.]+)/i);
  const lenMatch = output.match(/Length\s+\(seconds\):\s*([-\d.]+)/i);
  const maxAmp = maxMatch ? Number(maxMatch[1]) : NaN;
  const rmsAmp = rmsMatch ? Number(rmsMatch[1]) : NaN;
  const lengthSec = lenMatch ? Number(lenMatch[1]) : NaN;
  if (!Number.isFinite(maxAmp) || !Number.isFinite(rmsAmp) || !Number.isFinite(lengthSec)) {
    throw new Error(`Unable to parse sox stat output for ${wavPath}`);
  }
  return { max_amp: maxAmp, rms_amp: rmsAmp, length_sec: lengthSec, raw: output };
}

function getWavStatsSegment(
  wavPath: string,
  startSec: number,
  durationSec: number,
): { max_amp: number; rms_amp: number; length_sec: number; raw: string } {
  const safeStart = Math.max(0, startSec);
  const safeDur = Math.max(0.01, durationSec);
  const res = spawnSync("sox", [wavPath, "-n", "trim", safeStart.toFixed(3), safeDur.toFixed(3), "stat"], {
    encoding: "utf8",
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`sox stat (segment) failed: ${res.stderr || res.stdout || "unknown error"}`);
  }
  const output = `${res.stderr ?? ""}`.trim();
  const maxMatch = output.match(/Maximum amplitude:\s*([-\d.]+)/i);
  const rmsMatch = output.match(/RMS\s+amplitude:\s*([-\d.]+)/i);
  const lenMatch = output.match(/Length\s+\(seconds\):\s*([-\d.]+)/i);
  const maxAmp = maxMatch ? Number(maxMatch[1]) : NaN;
  const rmsAmp = rmsMatch ? Number(rmsMatch[1]) : NaN;
  const lengthSec = lenMatch ? Number(lenMatch[1]) : NaN;
  if (!Number.isFinite(maxAmp) || !Number.isFinite(rmsAmp) || !Number.isFinite(lengthSec)) {
    throw new Error(`Unable to parse sox stat output for ${wavPath}`);
  }
  return { max_amp: maxAmp, rms_amp: rmsAmp, length_sec: lengthSec, raw: output };
}

type SpeechWindow = {
  max_amp: number;
  threshold: number;
  start_sec: number;
  end_sec: number;
  duration_sec: number;
};

function getSpeechWindow(wavPath: string, thresholdRatio = 0.05): SpeechWindow | null {
  const buf = fs.readFileSync(wavPath);
  if (buf.length < 44) return null;
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") return null;

  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString("ascii", offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    const chunkData = offset + 8;
    if (chunkId === "fmt ") {
      const audioFormat = buf.readUInt16LE(chunkData);
      channels = buf.readUInt16LE(chunkData + 2);
      sampleRate = buf.readUInt32LE(chunkData + 4);
      bitsPerSample = buf.readUInt16LE(chunkData + 14);
      if (audioFormat !== 1) return null;
    } else if (chunkId === "data") {
      dataOffset = chunkData;
      dataSize = chunkSize;
      break;
    }
    offset = chunkData + chunkSize;
  }

  if (dataOffset < 0 || dataSize <= 0) return null;
  if (bitsPerSample !== 16 || channels < 1 || sampleRate <= 0) return null;

  const sampleCount = Math.floor(dataSize / 2);
  let maxAmp = 0;
  for (let i = 0; i < sampleCount; i += 1) {
    const sample = buf.readInt16LE(dataOffset + i * 2);
    const abs = Math.abs(sample);
    if (abs > maxAmp) maxAmp = abs;
  }
  if (maxAmp === 0) return null;

  const threshold = Math.max(1, Math.floor(maxAmp * thresholdRatio));
  let firstFrame = -1;
  let lastFrame = -1;
  const frames = Math.floor(sampleCount / channels);
  for (let frame = 0; frame < frames; frame += 1) {
    let frameMax = 0;
    const base = dataOffset + frame * channels * 2;
    for (let ch = 0; ch < channels; ch += 1) {
      const sample = buf.readInt16LE(base + ch * 2);
      const abs = Math.abs(sample);
      if (abs > frameMax) frameMax = abs;
    }
    if (frameMax >= threshold) {
      if (firstFrame < 0) firstFrame = frame;
      lastFrame = frame;
    }
  }

  if (firstFrame < 0 || lastFrame < 0) return null;
  const startSec = firstFrame / sampleRate;
  const endSec = (lastFrame + 1) / sampleRate;
  return {
    max_amp: maxAmp / 32768,
    threshold: threshold / 32768,
    start_sec: Number(startSec.toFixed(6)),
    end_sec: Number(endSec.toFixed(6)),
    duration_sec: Number((endSec - startSec).toFixed(6)),
  };
}

async function cmdSpeak(args: string[], json: boolean): Promise<void> {
  let voice = DEFAULT_SPEAK_VOICE;
  let rate = DEFAULT_SPEAK_RATE;
  let refresh = false;
  let timeoutMs = DEFAULT_EDGE_TTS_TIMEOUT_MS;

  // Collect all non-flag tokens as text (multi-word support, no quotes needed)
  const textParts: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (!a) continue;
    const next = args[i + 1];

    if (a === "--voice" && next) {
      voice = next;
      i += 1;
      continue;
    }
    if (a === "--rate" && next) {
      rate = next;
      i += 1;
      continue;
    }
    if (a === "--refresh" || a === "--no-cache") {
      refresh = true;
      continue;
    }
    if (a === "--timeout-ms" && next && /^\d+$/.test(next)) {
      timeoutMs = Number(next);
      i += 1;
      continue;
    }
    if (a.startsWith("--")) {
      throw new Error(`Unknown flag: ${a}`);
    }
    textParts.push(a);
  }

  const text = normalizeSpeakText(textParts.join(" "));
  if (!text) throw new Error("Usage: speak <text> [--voice <voice>] [--rate <rate>]");

  const { mp3Path, cached } = renderTts({
    text,
    voice,
    rate,
    sanitizerVersion: "sanitize_v1",
    refresh,
    timeoutMs,
    cacheDir: speakCacheDir(),
  });

  // Play audio (blocking)
  try {
    execFileSync("afplay", [mp3Path], { stdio: "ignore" });
  } catch (e: unknown) {
    const err = e as { message?: string };
    throw new Error(`Audio playback failed: ${err.message || e}\nFile: ${mp3Path}`);
  }

  if (json) {
    printJson({
      ok: true,
      command: "speak",
      text,
      voice,
      rate,
      cached,
      file: mp3Path,
    });
    return;
  }

  console.log(`🔊 ${text}${cached ? " (cached)" : ""}`);
}

type ListenScore = {
  edits: number;
  ref_len: number;
  per: number;
  duration_ratio: number;
  pass: boolean;
};

type PhoneTool = {
  name: string;
  model: string;
  device: string;
  torch?: string;
  transformers?: string;
};

type PhonesResult = {
  phones: string[];
  tool: PhoneTool;
  timings_ms?: Record<string, number>;
};

function levenshteinTokens(a: string[], b: string[]): { edits: number; inserts: number; deletes: number; subs: number } {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const get = (i: number, j: number): number => dp[i]![j]!;
  const set = (i: number, j: number, value: number): void => {
    dp[i]![j] = value;
  };

  for (let i = 0; i <= n; i += 1) set(i, 0, i);
  for (let j = 0; j <= m; j += 1) set(0, j, j);

  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      set(
        i,
        j,
        Math.min(
          get(i - 1, j) + 1, // delete
          get(i, j - 1) + 1, // insert
          get(i - 1, j - 1) + cost, // substitute
        ),
      );
    }
  }

  // Backtrack for counts
  let i = n;
  let j = m;
  let inserts = 0;
  let deletes = 0;
  let subs = 0;
  while (i > 0 || j > 0) {
    if (i > 0 && get(i, j) === get(i - 1, j) + 1) {
      deletes += 1;
      i -= 1;
      continue;
    }
    if (j > 0 && get(i, j) === get(i, j - 1) + 1) {
      inserts += 1;
      j -= 1;
      continue;
    }
    if (i > 0 && j > 0) {
      if (a[i - 1] !== b[j - 1]) subs += 1;
      i -= 1;
      j -= 1;
    }
  }

  return { edits: get(n, m), inserts, deletes, subs };
}

function extractPhonesWav2Vec2(wavPath: string, pythonPath: string): PhonesResult {
  const scriptPath = phonemizeScriptPath();
  if (!fileExistsNonEmpty(scriptPath)) {
    throw new Error(`Phonemizer script not found: ${scriptPath}`);
  }

  const env = { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: "0" };

  let raw: string;
  try {
    raw = execFileSync(pythonPath, ["--", scriptPath, "--wav", wavPath, "--model", DEFAULT_PHONEME_MODEL], {
      encoding: "utf8",
      env,
      maxBuffer: 10 * 1024 * 1024,
    }).trim();
  } catch (e: unknown) {
    const err = e as { message?: string; stdout?: string; stderr?: string };
    const detail = [err.stderr, err.stdout].filter(Boolean).join("\n").trim();
    const suffix = detail ? `\n${detail}` : `\n${err.message || e}`;
    throw new Error(
      `Phoneme extraction failed (wav2vec2). Ensure python3 + torch + transformers + numpy are installed and MPS is available.${suffix}`,
    );
  }

  let parsed: { ok?: boolean; phones?: string[]; tool?: PhoneTool; timings_ms?: Record<string, number>; error?: string } | null = null;
  try {
    parsed = JSON.parse(raw) as {
      ok?: boolean;
      phones?: string[];
      tool?: PhoneTool;
      timings_ms?: Record<string, number>;
      error?: string;
    };
  } catch {
    throw new Error(`Phoneme extraction returned non-JSON output:\n${raw.slice(0, 500)}`);
  }

  if (!parsed || parsed.ok !== true) {
    throw new Error(`Phoneme extraction failed: ${parsed?.error || raw.slice(0, 500)}`);
  }
  if (!Array.isArray(parsed.phones) || parsed.phones.length === 0) {
    throw new Error(`Phoneme extraction returned empty phones for ${wavPath}`);
  }

  const tool: PhoneTool = parsed.tool ?? { name: "wav2vec2", model: DEFAULT_PHONEME_MODEL, device: "mps" };

  return { phones: parsed.phones, tool, timings_ms: parsed.timings_ms };
}

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

async function cmdListen(args: string[], json: boolean): Promise<void> {
  let voice = DEFAULT_LISTEN_VOICE;
  let refresh = false;
  const listenRate = "-25%";
  let startMs = 50;
  let silenceMs = 1200;
  let threshold = "1%";
  let maxSeconds = 12;
  let refPath: string | null = null;
  let noPlayRef = false;
  let keep = false;
  let outDir: string | null = null;
  let debug = false;
  let debugDir: string | null = null;

  const textParts: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (!a) continue;
    const next = args[i + 1];

    if (isHelpToken(a)) {
      if (json) {
        printJson({
          ok: true,
          command: "listen",
          usage: "site-toggle listen <text...> [--voice <voice>] [--start-ms <ms>] [--silence-ms <ms>] [--threshold <value>] [--max-seconds <n>] [--no-play-ref] [--keep] [--out-dir <path>] [--ref <file>] [--refresh] [--debug]",
        });
      } else {
        console.log("Usage:");
        console.log(
          "  site-toggle listen <text...> [--voice <voice>] [--start-ms <ms>] [--silence-ms <ms>] [--threshold <value>] [--max-seconds <n>] [--no-play-ref] [--keep] [--out-dir <path>] [--ref <file>] [--refresh] [--debug]",
        );
      }
      return;
    }

    if (a === "--voice" && next) {
      voice = next;
      i += 1;
      continue;
    }
    if (a === "--start-ms" && next && /^\d+$/.test(next)) {
      startMs = Number(next);
      i += 1;
      continue;
    }
    if (a === "--silence-ms" && next && /^\d+$/.test(next)) {
      silenceMs = Number(next);
      i += 1;
      continue;
    }
    if (a === "--threshold" && next) {
      threshold = next;
      i += 1;
      continue;
    }
    if (a === "--max-seconds" && next && /^\d+$/.test(next)) {
      maxSeconds = Number(next);
      i += 1;
      continue;
    }
    if (a === "--ref" && next) {
      refPath = next;
      i += 1;
      continue;
    }
    if (a === "--out-dir" && next) {
      outDir = next;
      i += 1;
      continue;
    }
    if (a === "--refresh" || a === "--no-cache") {
      refresh = true;
      continue;
    }
    if (a === "--no-play-ref") {
      noPlayRef = true;
      continue;
    }
    if (a === "--keep") {
      keep = true;
      continue;
    }
    if (a === "--debug") {
      debug = true;
      continue;
    }
    if (a.startsWith("--")) throw new Error(`Unknown flag: ${a}`);
    textParts.push(a);
  }

  if (debug) keep = true;

  if (refPath && textParts.length > 0) {
    throw new Error("Provide either <text...> or --ref <file>, not both.");
  }
  if (!refPath && textParts.length === 0) {
    throw new Error("Usage: listen <text...> OR listen --ref <audio-file>");
  }

  requireCommand("sox", "Install with: brew install sox");
  if (!noPlayRef) requireCommand("afplay", "afplay is required for audio playback");
  const pythonPath = pythonExecPath();

  let refMp3Path: string | null = null;
  let refHash: string;
  let listenTextUsed: string | null = null;
  let listenRateUsed: string | null = null;
  if (refPath) {
    const absRef = path.resolve(refPath);
    if (!fileExistsNonEmpty(absRef)) throw new Error(`Reference audio not found or empty: ${absRef}`);
    const buf = fs.readFileSync(absRef);
    refHash = hashBuffer(buf).slice(0, 24);
    refMp3Path = absRef;
  } else {
    requireCommand("edge-tts", "Install with: pipx install edge-tts");
    const text = normalizeSpeakText(textParts.join(" "));
    if (!text) throw new Error("Usage: listen <text...>");
    const listenText = /[.!?]$/.test(text) ? text : `${text}.`;
    listenTextUsed = listenText;
    listenRateUsed = listenRate;

    const cacheDir = speakCacheDir();
    fs.mkdirSync(cacheDir, { recursive: true });

    const hash = crypto
      .createHash("sha256")
      .update(`v1|listen|${voice}|${listenRate}|${listenText}`, "utf8")
      .digest("hex")
      .slice(0, 24);

    const mp3Path = path.join(cacheDir, `${hash}.mp3`);
    if (!refresh && fileExistsNonEmpty(mp3Path)) {
      refMp3Path = mp3Path;
    } else {
      const tmpMp3 = path.join(cacheDir, `${hash}.tmp-${process.pid}-${Date.now()}.mp3`);
      try {
        fs.rmSync(tmpMp3, { force: true });
      } catch {
        // ignore
      }

      try {
        execFileSync(
          "edge-tts",
          ["--voice", voice, "--text", listenText, "--rate", listenRate, "--write-media", tmpMp3],
          { stdio: ["ignore", "pipe", "pipe"], timeout: DEFAULT_EDGE_TTS_TIMEOUT_MS },
        );

        if (!fileExistsNonEmpty(tmpMp3)) {
          throw new Error("edge-tts produced an empty audio file");
        }

        fs.renameSync(tmpMp3, mp3Path);
        refMp3Path = mp3Path;
      } catch (e: unknown) {
        try {
          fs.rmSync(tmpMp3, { force: true });
        } catch {
          // ignore
        }

        const err = e as { code?: string; killed?: boolean; message?: string };
        const errMsg =
          err.code === "ETIMEDOUT" || err.killed
            ? `edge-tts timed out after ${DEFAULT_EDGE_TTS_TIMEOUT_MS}ms (are you offline?)`
            : err.code === "ENOENT"
              ? "edge-tts not found. Install with: pipx install edge-tts"
              : `edge-tts failed: ${err.message || e}`;

        throw new Error(errMsg);
      }
    }
    refHash = hash;
  }

  if (!refMp3Path) throw new Error("Missing reference audio path");

  const baseDir = outDir ? path.resolve(outDir) : path.join(speakCacheDir(), "listen");
  if (debug) {
    debugDir = path.join(baseDir, "debug", `listen-${Date.now()}`);
    ensureDir(debugDir);
  }
  const refDir = path.join(baseDir, "refs", refHash);
  ensureDir(refDir);
  const refWavPath = path.join(refDir, "ref.wav");
  const refPhonesPath = path.join(refDir, "ref.phones.json");

  if (refresh || !fileExistsNonEmpty(refWavPath)) {
    execFileSync("sox", [refMp3Path, "-r", "16000", "-c", "1", "-b", "16", refWavPath], { stdio: "ignore" });
  }
  if (!fileExistsNonEmpty(refWavPath)) throw new Error(`Failed to create reference wav: ${refWavPath}`);
  if (getWavSampleRate(refWavPath) !== 16000) {
    throw new Error(`Reference wav sample rate is not 16000Hz: ${refWavPath}`);
  }
  if (getWavChannels(refWavPath) !== 1) {
    throw new Error(`Reference wav must be mono: ${refWavPath}`);
  }
  if (debug && debugDir) {
    const debugRefDir = path.join(debugDir, "ref");
    ensureDir(debugRefDir);
    try {
      const ext = path.extname(refMp3Path || "");
      const refInputName = ext ? `ref_input${ext}` : "ref_input.audio";
      fs.copyFileSync(refMp3Path, path.join(debugRefDir, refInputName));
    } catch {
      // ignore
    }
    try {
      fs.copyFileSync(refWavPath, path.join(debugRefDir, "ref.wav"));
    } catch {
      // ignore
    }
  }

  let refPhones: string[] | null = null;
  let refTool: PhoneTool | null = null;
  let refCached = false;
  if (!refresh && fileExistsNonEmpty(refPhonesPath)) {
    const raw = fs.readFileSync(refPhonesPath, "utf8");
    try {
      const parsed = JSON.parse(raw) as { phones?: string[]; tool?: PhoneTool };
      if (
        Array.isArray(parsed.phones) &&
        parsed.phones.length > 0 &&
        parsed.tool?.model === DEFAULT_PHONEME_MODEL &&
        parsed.tool?.name === "wav2vec2"
      ) {
        refPhones = parsed.phones;
        refTool = parsed.tool;
        refCached = true;
      }
    } catch {
      // ignore
    }
  }
  if (!refPhones) {
    const refRes = extractPhonesWav2Vec2(refWavPath, pythonPath);
    refPhones = refRes.phones;
    refTool = refRes.tool;
    fs.writeFileSync(
      refPhonesPath,
      JSON.stringify(
        {
          phones: refPhones,
          tool: refTool,
          created_at: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  }
  if (!refPhones || refPhones.length === 0) throw new Error("Reference phones were empty");
  if (!refTool) refTool = { name: "wav2vec2", model: DEFAULT_PHONEME_MODEL, device: "mps" };

  let refPlaybackSec: number | null = null;
  if (!noPlayRef) {
    const playbackStart = Date.now();
    try {
      execFileSync("afplay", [refMp3Path], { stdio: "ignore" });
    } catch (e: unknown) {
      const err = e as { message?: string };
      throw new Error(`Audio playback failed: ${err.message || e}\nFile: ${refMp3Path}`);
    } finally {
      refPlaybackSec = (Date.now() - playbackStart) / 1000;
    }
  }

  let refStats:
    | {
        wav_bytes: number;
        wav_duration_sec: number;
        wav_sample_rate: number;
        wav_channels: number;
        wav_stats: { max_amp: number; rms_amp: number; length_sec: number; raw: string };
        wav_head_stats: { max_amp: number; rms_amp: number; length_sec: number; raw: string };
        wav_tail_stats: { max_amp: number; rms_amp: number; length_sec: number; raw: string };
        wav_head_rms: number;
        wav_tail_rms: number;
        speech_window: SpeechWindow | null;
        tts_text: string | null;
        tts_rate: string | null;
        tts_voice: string | null;
        mp3_bytes: number;
        mp3_duration_sec: number;
        mp3_path: string;
        playback_sec: number | null;
      }
    | undefined;
  if (debug) {
    const refWavDuration = getAudioDurationSeconds(refWavPath);
    const headWindow = Math.min(0.2, refWavDuration);
    const tailStart = Math.max(0, refWavDuration - headWindow);
    const headStats = getWavStatsSegment(refWavPath, 0, headWindow);
    const tailStats = getWavStatsSegment(refWavPath, tailStart, headWindow);
    refStats = {
      wav_bytes: fs.statSync(refWavPath).size,
      wav_duration_sec: refWavDuration,
      wav_sample_rate: getWavSampleRate(refWavPath),
      wav_channels: getWavChannels(refWavPath),
      wav_stats: getWavStats(refWavPath),
      wav_head_stats: headStats,
      wav_tail_stats: tailStats,
      wav_head_rms: Number(headStats.rms_amp.toFixed(6)),
      wav_tail_rms: Number(tailStats.rms_amp.toFixed(6)),
      speech_window: getSpeechWindow(refWavPath),
      tts_text: listenTextUsed,
      tts_rate: listenRateUsed,
      tts_voice: voice,
      mp3_bytes: fs.statSync(refMp3Path).size,
      mp3_duration_sec: getAudioDurationSeconds(refMp3Path),
      mp3_path: refMp3Path,
      playback_sec: refPlaybackSec,
    };
  }

  const attemptDir = outDir ? baseDir : path.join(baseDir, "attempts", `attempt-${Date.now()}`);
  ensureDir(attemptDir);
  const attemptPath = path.join(attemptDir, "attempt.wav");

  const startSec = Math.max(0.01, startMs / 1000);
  const silenceSec = Math.max(0.01, silenceMs / 1000);

  execFileSync(
    "sox",
    [
      "-q",
      "-d",
      "-r",
      "16000",
      "-c",
      "1",
      "-b",
      "16",
      "-e",
      "signed-integer",
      attemptPath,
      "silence",
      "-l",
      "1",
      startSec.toFixed(2),
      threshold,
      "1",
      silenceSec.toFixed(2),
      threshold,
      "pad",
      "0.2",
      "0.2",
      "trim",
      "0",
      String(maxSeconds),
    ],
    { stdio: "inherit" },
  );

  if (!fileExistsNonEmpty(attemptPath)) {
    throw new Error("Recording failed (empty audio). Check mic permission: System Settings -> Privacy & Security -> Microphone.");
  }

  const attemptChannels = getWavChannels(attemptPath);
  if (attemptChannels !== 1) {
    throw new Error(`Recording must be mono (1 channel). Fix input device channel config and try again.`);
  }

  const attemptSampleRate = getWavSampleRate(attemptPath);
  let originalSampleRate: number | null = null;
  if (attemptSampleRate !== 16000) {
    const resampled = path.join(attemptDir, "attempt.16k.wav");
    execFileSync("sox", [attemptPath, "-r", "16000", "-c", "1", "-b", "16", resampled], { stdio: "ignore" });
    if (!fileExistsNonEmpty(resampled)) {
      throw new Error("Failed to resample attempt audio to 16kHz.");
    }
    if (getWavSampleRate(resampled) !== 16000 || getWavChannels(resampled) !== 1) {
      throw new Error("Resampled attempt audio is not 16kHz mono.");
    }
    originalSampleRate = attemptSampleRate;
    // Use resampled file for analysis
    fs.rmSync(attemptPath, { force: true });
    fs.renameSync(resampled, attemptPath);
  }

  const attemptDur = getWavDurationSeconds(attemptPath);
  if (attemptDur < 0.3) {
    throw new Error("Recording too short or silent. Check mic permission and threshold settings.");
  }

  const attemptStats = getWavStats(attemptPath);
  const attemptBytes = fs.statSync(attemptPath).size;

  const attemptRes = extractPhonesWav2Vec2(attemptPath, pythonPath);
  const attemptPhones = attemptRes.phones;
  const attemptTool = attemptRes.tool;
  if (attemptPhones.length === 0) throw new Error("Attempt phones were empty");

  if (debug && debugDir) {
    const debugAttemptDir = path.join(debugDir, "attempt");
    ensureDir(debugAttemptDir);
    try {
      fs.copyFileSync(attemptPath, path.join(debugAttemptDir, "attempt.wav"));
    } catch {
      // ignore
    }
    try {
      fs.writeFileSync(
        path.join(debugDir, "meta.json"),
        JSON.stringify(
          {
            created_at: new Date().toISOString(),
            voice,
            start_ms: startMs,
            silence_ms: silenceMs,
            threshold,
            max_seconds: maxSeconds,
            no_play_ref: noPlayRef,
            ref_hash: refHash,
            ref_text: listenTextUsed,
            ref_rate: listenRateUsed,
            ref_voice: voice,
          },
          null,
          2,
        ),
      );
    } catch {
      // ignore
    }
  }

  const refDur = getWavDurationSeconds(refWavPath);
  const refWindow = getSpeechWindow(refWavPath);
  const attemptWindow = getSpeechWindow(attemptPath);
  const { edits } = levenshteinTokens(refPhones, attemptPhones);
  const per = refPhones.length > 0 ? edits / refPhones.length : 1;
  const refLen = refWindow?.duration_sec ?? refDur;
  const attemptLen = attemptWindow?.duration_sec ?? attemptDur;
  const durationRatio = refLen > 0 ? attemptLen / refLen : 0;
  const pass = per <= 0.15 && durationRatio >= 0.75 && durationRatio <= 1.35;

  const score: ListenScore = {
    edits,
    ref_len: refPhones.length,
    per: Number(per.toFixed(3)),
    duration_ratio: Number(durationRatio.toFixed(3)),
    pass,
  };

  if (!keep && !outDir) {
    try {
      fs.rmSync(attemptPath, { force: true });
    } catch {
      // ignore
    }
  }

  if (json) {
    printJson({
      ok: true,
      command: "listen",
      debug_dir: debugDir,
      ref: {
        wav: refWavPath,
        phones: refPhones,
        tool: refTool,
        cached: refCached,
        stats: refStats,
      },
      attempt: {
        wav: attemptPath,
        phones: attemptPhones,
        tool: attemptTool,
        stats: debug
          ? {
              max_amp: attemptStats.max_amp,
              rms_amp: attemptStats.rms_amp,
              length_sec: attemptStats.length_sec,
              raw: attemptStats.raw,
              sample_rate: getWavSampleRate(attemptPath),
              channels: getWavChannels(attemptPath),
              bytes: attemptBytes,
              resampled_from_hz: originalSampleRate,
              speech_window: getSpeechWindow(attemptPath),
            }
          : {
              max_amp: attemptStats.max_amp,
              rms_amp: attemptStats.rms_amp,
              length_sec: attemptStats.length_sec,
            },
      },
      score,
    });
    return;
  }

  console.log("Listen");
  console.log("======");
  console.log(`Ref phones: ${refPhones.length}`);
  console.log(`Attempt phones: ${attemptPhones.length}`);
  if (debug && refStats) {
    console.log(`Ref wav: ${refWavPath}`);
    if (debugDir) console.log(`Debug dir: ${debugDir}`);
    console.log(`Ref wav duration: ${refStats.wav_duration_sec.toFixed(3)}s`);
    console.log(`Ref wav sample rate: ${refStats.wav_sample_rate}Hz`);
    console.log(`Ref wav channels: ${refStats.wav_channels}`);
    console.log(`Ref mp3: ${refStats.mp3_path}`);
    console.log(`Ref mp3 duration: ${refStats.mp3_duration_sec.toFixed(3)}s`);
    console.log(`Ref mp3 bytes: ${refStats.mp3_bytes}`);
    if (refStats.tts_text || refStats.tts_rate) {
      console.log(`Ref TTS text: ${refStats.tts_text ?? ""}`);
      console.log(`Ref TTS rate: ${refStats.tts_rate ?? ""}`);
      console.log(`Ref TTS voice: ${refStats.tts_voice ?? ""}`);
    }
    if (refStats.playback_sec !== null) {
      console.log(`Ref playback seconds: ${refStats.playback_sec.toFixed(3)}s`);
    }
    if (refStats.speech_window) {
      console.log(
        `Ref speech window: ${refStats.speech_window.start_sec.toFixed(3)}s–${refStats.speech_window.end_sec.toFixed(3)}s ` +
          `(dur ${refStats.speech_window.duration_sec.toFixed(3)}s, thr ${refStats.speech_window.threshold.toFixed(5)})`,
      );
    }
  }
  console.log(
    `Attempt audio: ${attemptStats.length_sec.toFixed(2)}s, max_amp=${attemptStats.max_amp.toFixed(4)}, rms=${attemptStats.rms_amp.toFixed(4)}`,
  );
  if (debug) {
    console.log(`Attempt file: ${attemptPath}`);
    console.log(`Attempt bytes: ${attemptBytes}`);
    console.log(`Attempt sample rate: ${getWavSampleRate(attemptPath)}Hz`);
    console.log(`Attempt channels: ${getWavChannels(attemptPath)}`);
    if (originalSampleRate) console.log(`Attempt resampled from: ${originalSampleRate}Hz`);
    console.log("Sox stat:\n" + attemptStats.raw);
  }
  console.log(`PER: ${score.per}`);
  console.log(`Duration ratio: ${score.duration_ratio}`);
  console.log(pass ? "Result: PASS" : "Result: NEEDS WORK");
}

async function main(): Promise<void> {
  const { command, args, json } = parseArgs(process.argv.slice(2));

  try {
    if (isHelpToken(command)) {
      printMainHelp(json);
      return;
    }
    switch (command) {
      case "doctor":
        await cmdDoctor(json);
        return;
      case "status":
        cmdStatus(json);
        return;
      case "on":
        cmdOn(args, json);
        return;
      case "off":
        cmdOff(args, json);
        return;
      case "stats":
        cmdStats(json);
        return;
      case "clear-stats":
      case "clear":
        cmdClearStats(json);
        return;
      case "seed":
        cmdSeed(json);
        return;
      case "deck":
        cmdDeck(args, json);
        return;
      case "suggest":
        await cmdSuggest(args, json);
        return;
      case "break":
        await cmdBreak(args, json);
        return;
      case "choose":
        cmdChoose(args, json);
        return;
      case "rate":
        cmdRate(args, json);
        return;
      case "locations":
        cmdLocations(args, json);
        return;
      case "contexts":
        cmdContexts(args, json);
        return;
      case "context":
        cmdContext(args, json);
        return;
      case "modules":
        cmdModules(json);
        return;
      case "module":
        await cmdModule(args, json);
        return;
      case "import":
        cmdImport(args, json);
        return;
      case "run-lines":
        await cmdRunLines(args, json, printJson);
        return;
      case "speak":
        await cmdSpeak(args, json);
        return;
      case "listen":
        await cmdListen(args, json);
        return;
      case "play":
        await cmdPlay(args, json);
        return;
      case "ui":
        await cmdUi(args, json);
        return;
      case "daemon":
        if (args[0] === "tick") return cmdDaemonTick(json);
        if (args[0] === "install") return cmdDaemonInstall(json);
        if (args[0] === "uninstall") return cmdDaemonUninstall(json);
        if (args[0] === "status") return cmdDaemonStatus(json);
        throw new Error("Usage: daemon <tick|install|uninstall|status>");
      case "_timer":
        cmdTimer(args, json);
        return;
      case "_reentry":
        cmdReentry(args, json);
        return;
      case "import-usage-log": {
        const { db } = openDb();
        const res = importUsageLogIfPresent(db);
        if (json) printJson({ ok: true, command: "import-usage-log", ...res });
        else console.log(`Imported ${res.imported} rows from usage.log`);
        return;
      }
      default:
        throw new Error(
          `Unknown command: ${command}\nUsage: site-toggle [status|on|off|stats|clear-stats|seed|deck|suggest|break|choose|rate|locations|contexts|context|modules|module|import|run-lines|speak|listen|play|ui|doctor]`,
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (json) {
      if (err instanceof CliError) {
        printJson({ ok: false, command, error_code: err.code, error: message });
      } else {
        printJson({ ok: false, command, error: message });
      }
      process.exit(1);
    }
    console.error(message);
    process.exit(1);
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
