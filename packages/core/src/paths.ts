import path from "node:path";

export const HOSTS_FILE_PATH = "/etc/hosts";
export const TIMER_DIR_PATH = "/tmp/site-toggle-timers";

// Default DB path (absolute; avoid ~ because sudo can change HOME).
export const DEFAULT_DB_PATH = path.join(
  "/Users/ryanpfister/Library/Application Support/Site Blocker",
  "siteblocker.db",
);

export function resolveDbPath(): string {
  const override = process.env["SITE_BLOCKER_DB_PATH"]?.trim();
  return override && override.length > 0 ? override : DEFAULT_DB_PATH;
}
