import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";

import {
  ALL_SITE_SLUGS,
  HOSTS_FILE_PATH,
  TIMER_DIR_PATH,
  blockDomains,
  startTimer,
  isDomainBlocked,
  buildBreakMenu,
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
  openDb,
  readHostsFile,
  resolveDbPath,
  seedCardsFromDir,
  selectBreakCards,
  setSetting,
  setCardRating,
  setSiteUnblockedUntil,
  unlinkContextLocation,
  unblockDomains,
  writeHostsFile,
} from "@circuit-breaker/core";

import type { ModuleDefinition } from "@circuit-breaker/core";
import { cmdPlay } from "./commands/play.js";

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
    "speak",
    "play",
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

function printModuleHelp(json: boolean, moduleSlug?: string): void {
  const actions = ["history", "start", "complete", "resume", "last", "test", "test-complete"];
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

  if (json) {
    printJson({ ok: true, command: "break", ...menu });
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
    optionNum += 1;
  }
  console.log("");
  console.log(`Choose: site-toggle choose ${menu.event_key} physical|verb|noun|lesson|sovt|fusion|feed|same_need`);
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
  if (action === "test") return cmdModuleTest(moduleDef, actionArgs, json);
  if (action === "test-complete") return cmdModuleTestComplete(moduleDef, actionArgs, json);

  throw new Error(`Unknown module action: ${action}\nUsage: module <slug> <history|start|complete|resume|last|test|test-complete>`);
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

  const isCardLaneType = (t: string): boolean => ["card", "card2", "physical", "verb", "noun", "lesson", "sovt", "fusion"].includes(t);

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
const DEFAULT_EDGE_TTS_TIMEOUT_MS = 15_000;

function speakCacheDir(): string {
  // Per-UID cache avoids permission issues if speak is ever run under sudo
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  return uid === null ? "/tmp/circuit-breaker-audio" : `/tmp/circuit-breaker-audio-${uid}`;
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

async function cmdSpeak(args: string[], json: boolean): Promise<void> {
  let voice = DEFAULT_SPEAK_VOICE;
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
  if (!text) throw new Error("Usage: speak <text> [--voice <voice>]");

  const cacheDir = speakCacheDir();
  fs.mkdirSync(cacheDir, { recursive: true });

  const hash = crypto
    .createHash("sha256")
    .update(`v1|${voice}|${text}`, "utf8")
    .digest("hex")
    .slice(0, 24);

  const mp3Path = path.join(cacheDir, `${hash}.mp3`);
  let cached = false;

  // Check cache first
  if (!refresh && fileExistsNonEmpty(mp3Path)) {
    cached = true;
  } else {
    // Generate with edge-tts (atomic write via temp file)
    const tmpMp3 = path.join(cacheDir, `${hash}.tmp-${process.pid}-${Date.now()}.mp3`);
    try {
      fs.rmSync(tmpMp3, { force: true });
    } catch {
      // ignore
    }

    try {
      execFileSync(
        "edge-tts",
        ["--voice", voice, "--text", text, "--write-media", tmpMp3],
        { stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs },
      );

      if (!fileExistsNonEmpty(tmpMp3)) {
        throw new Error("edge-tts produced an empty audio file");
      }

      fs.renameSync(tmpMp3, mp3Path);
    } catch (e: unknown) {
      try {
        fs.rmSync(tmpMp3, { force: true });
      } catch {
        // ignore
      }

      const err = e as { code?: string; killed?: boolean; message?: string };
      const errMsg =
        err.code === "ETIMEDOUT" || err.killed
          ? `edge-tts timed out after ${timeoutMs}ms (are you offline?)`
          : err.code === "ENOENT"
            ? "edge-tts not found. Install with: pipx install edge-tts"
            : `edge-tts failed: ${err.message || e}`;

      throw new Error(errMsg);
    }
  }

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
      cached,
      file: mp3Path,
    });
    return;
  }

  console.log(`🔊 ${text}${cached ? " (cached)" : ""}`);
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
      case "speak":
        await cmdSpeak(args, json);
        return;
      case "play":
        await cmdPlay(args, json);
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
          `Unknown command: ${command}\nUsage: site-toggle [status|on|off|stats|clear-stats|seed|suggest|break|choose|rate|locations|contexts|context|modules|module|import|speak|play|doctor]`,
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
