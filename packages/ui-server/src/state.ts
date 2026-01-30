import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type UiServerStateV1 = {
  version: 1;
  pid: number;
  port: number;
  started_at: string;
  ui_url: string;
  ws_url: string;
  token: string;
  log_path: string;
};

export function defaultStateDir(): string {
  return path.join(os.homedir(), "Library", "Application Support", "Circuit Breaker", "ui-server");
}

export function statePath(stateDir: string): string {
  return path.join(stateDir, "state.json");
}

export function writeState(stateDir: string, state: UiServerStateV1): void {
  fs.mkdirSync(stateDir, { recursive: true });
  const p = statePath(stateDir);
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(tmp, p);
}

export function tryReadState(stateDir: string): UiServerStateV1 | null {
  try {
    const raw = fs.readFileSync(statePath(stateDir), "utf8");
    const parsed = JSON.parse(raw) as UiServerStateV1;
    if (!parsed || parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

