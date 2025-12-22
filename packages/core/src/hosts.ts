import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { HOSTS_FILE_PATH } from "./paths.js";

/**
 * Essential /etc/hosts entries that must always be present.
 * These are standard macOS system entries required for proper networking.
 */
const ESSENTIAL_ENTRIES = [
  "127.0.0.1\tlocalhost",
  "255.255.255.255\tbroadcasthost",
  "::1\tlocalhost",
];

/**
 * Header comment for the hosts file (standard macOS format).
 */
const HOSTS_HEADER = `##
# Host Database
#
# localhost is used to configure the loopback interface
# when the system is booting.  Do not change this entry.
##`;

/**
 * Check if a hosts file line represents one of the essential entries.
 * Matches by IP address and hostname, ignoring whitespace differences.
 */
function isEssentialEntry(line: string): boolean {
  const tokens = tokensForHostsLine(line);
  if (tokens.length < 2) return false;

  const ip = tokens[0];
  const hostnames = tokens.slice(1);

  // Check against each essential entry pattern
  for (const essential of ESSENTIAL_ENTRIES) {
    const essentialTokens = essential.split(/\s+/g).filter(Boolean);
    if (essentialTokens.length < 2) continue;

    const essentialIp = essentialTokens[0];
    const essentialHostname = essentialTokens[1];

    if (essentialHostname && ip === essentialIp && hostnames.includes(essentialHostname)) {
      return true;
    }
  }

  return false;
}

/**
 * Ensures all essential entries are present in the hosts file contents.
 * Adds missing entries after any header comments.
 */
function ensureEssentialEntries(hostsContents: string): string {
  const lines = hostsContents.split("\n");
  const presentEssentials = new Set<string>();

  // Find which essential entries are already present
  for (const line of lines) {
    const tokens = tokensForHostsLine(line);
    if (tokens.length < 2) continue;

    const ip = tokens[0];
    const hostnames = tokens.slice(1);

    for (const essential of ESSENTIAL_ENTRIES) {
      const essentialTokens = essential.split(/\s+/g).filter(Boolean);
      if (essentialTokens.length < 2) continue;

      const essentialIp = essentialTokens[0];
      const essentialHostname = essentialTokens[1];

      if (essentialHostname && ip === essentialIp && hostnames.includes(essentialHostname)) {
        presentEssentials.add(essential);
      }
    }
  }

  // If all essential entries present, return as-is
  if (presentEssentials.size === ESSENTIAL_ENTRIES.length) {
    return hostsContents;
  }

  // Find missing entries
  const missingEntries = ESSENTIAL_ENTRIES.filter(e => !presentEssentials.has(e));

  // Check if header is present
  const hasHeader = hostsContents.includes("# Host Database");

  // Build new contents
  let result: string;
  if (hasHeader) {
    // Insert missing entries after the header block (after first "##" closing)
    const headerEndIndex = hostsContents.indexOf("##", hostsContents.indexOf("# Host Database"));
    const afterHeader = hostsContents.indexOf("\n", headerEndIndex);

    if (afterHeader !== -1) {
      const before = hostsContents.slice(0, afterHeader + 1);
      const after = hostsContents.slice(afterHeader + 1);
      result = before + missingEntries.join("\n") + "\n" + after;
    } else {
      result = hostsContents + "\n" + missingEntries.join("\n") + "\n";
    }
  } else {
    // Add header and essential entries at the beginning
    result = HOSTS_HEADER + "\n" + missingEntries.join("\n") + "\n" + hostsContents;
  }

  // Ensure file ends with newline
  if (!result.endsWith("\n")) {
    result += "\n";
  }

  return result;
}

function stripComment(line: string): string {
  const idx = line.indexOf("#");
  return idx === -1 ? line : line.slice(0, idx);
}

function tokensForHostsLine(line: string): string[] {
  const base = stripComment(line).trim();
  if (!base) return [];
  return base.split(/\s+/g).filter(Boolean);
}

function lineHasDomainToken(line: string, domain: string): boolean {
  const tokens = tokensForHostsLine(line);
  return tokens.includes(domain);
}

function lineBlocksDomain(line: string, domain: string): boolean {
  const tokens = tokensForHostsLine(line);
  if (tokens.length < 2) return false;
  if (tokens[0] !== "127.0.0.1") return false;
  return tokens.includes(domain);
}

export function readHostsFile(hostsPath: string = HOSTS_FILE_PATH): string {
  return fs.readFileSync(hostsPath, "utf8");
}

export function writeHostsFile(contents: string, hostsPath: string = HOSTS_FILE_PATH): void {
  // Always ensure essential entries are present before writing
  const safeContents = ensureEssentialEntries(contents);
  fs.writeFileSync(hostsPath, safeContents, "utf8");
}

export function isDomainBlocked(hostsContents: string, domain: string): boolean {
  const lines = hostsContents.split("\n");
  return lines.some((l) => lineBlocksDomain(l, domain));
}

export function blockDomains(hostsContents: string, domains: string[]): string {
  let out = hostsContents;
  if (!out.endsWith("\n")) out += "\n";

  const lines = out.split("\n");
  const blocked = new Set<string>();
  for (const d of domains) {
    for (const line of lines) {
      if (lineBlocksDomain(line, d)) {
        blocked.add(d);
        break;
      }
    }
  }

  for (const domain of domains) {
    if (blocked.has(domain)) continue;
    out += `127.0.0.1\t${domain}\n`;
  }

  return out;
}

export function unblockDomains(hostsContents: string, domains: string[]): string {
  const domainSet = new Set(domains);
  const lines = hostsContents.split("\n");
  const kept: string[] = [];

  for (const line of lines) {
    // Never remove essential system entries (localhost, broadcasthost, etc.)
    if (isEssentialEntry(line)) {
      kept.push(line);
      continue;
    }

    const baseTokens = tokensForHostsLine(line);
    const hasAny = baseTokens.some((t) => domainSet.has(t));
    if (hasAny) continue;
    kept.push(line);
  }

  let out = kept.join("\n");
  if (!out.endsWith("\n")) out += "\n";
  return out;
}

export function flushDns(): void {
  // These are safe even if they no-op; errors shouldn't crash toggling.
  try {
    execFileSync("dscacheutil", ["-flushcache"], { stdio: "ignore" });
  } catch {
    // ignore
  }
  try {
    execFileSync("killall", ["-HUP", "mDNSResponder"], { stdio: "ignore" });
  } catch {
    // ignore
  }
}

