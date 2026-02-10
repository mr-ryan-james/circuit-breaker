import os from "node:os";
import path from "node:path";

export const HOSTS_FILE_PATH = "/etc/hosts";
export const TIMER_DIR_PATH = "/tmp/site-toggle-timers";

function defaultHomeDir(): string {
  // On macOS, many commands run under `sudo` (to edit /etc/hosts), but we still want the *user* DB.
  // Prefer SUDO_USER so the DB remains stable across root/user invocations.
  const sudoUser = process.env["SUDO_USER"]?.trim();
  const isRoot = typeof (process as any).getuid === "function" ? (process as any).getuid() === 0 : false;
  if (process.platform === "darwin" && isRoot && sudoUser) {
    return path.join("/Users", sudoUser);
  }
  return os.homedir();
}

export const DEFAULT_DB_PATH = path.join(
  defaultHomeDir(),
  "Library/Application Support/Circuit Breaker",
  "circuitbreaker.db",
);

export function resolveDbPath(): string {
  const override = process.env["CIRCUIT_BREAKER_DB_PATH"]?.trim();
  if (override && override.length > 0) return override;

  // Default DB path (absolute; avoid ~; stable under sudo on macOS).
  return DEFAULT_DB_PATH;
}
