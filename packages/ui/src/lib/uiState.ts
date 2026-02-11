export type UiTab = "break" | "acting" | "spanish" | "sovt" | "allgravy" | "signals" | "status";

export type ActingMode = "practice" | "learn" | "read_through" | "speed_through";

export type UiPersistedStateV1 = {
  v: 1;
  tab?: UiTab;
  breakSite?: string;
  breakMinutes?: number;
  breakContext?: string;
  actingScriptId?: number;
  actingMe?: string;
  actingMode?: ActingMode;
  actingFromIdx?: number;
  actingToIdx?: number;
};

const STORAGE_KEY = "circuit_breaker_ui_state_v1";

function isUiTab(v: unknown): v is UiTab {
  return (
    v === "break" ||
    v === "acting" ||
    v === "spanish" ||
    v === "sovt" ||
    v === "allgravy" ||
    v === "signals" ||
    v === "status"
  );
}

function isActingMode(v: unknown): v is ActingMode {
  return v === "practice" || v === "learn" || v === "read_through" || v === "speed_through";
}

function parseIntSafe(v: string | null): number | null {
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function readUiStateFromUrl(): Partial<UiPersistedStateV1> {
  try {
    const params = new URLSearchParams(window.location.search);
    const tabRaw = params.get("tab");
    const site = params.get("breakSite");
    const minutes = parseIntSafe(params.get("breakMinutes"));
    const context = params.get("breakContext");
    const actingScriptId = parseIntSafe(params.get("actingScriptId"));
    const actingMe = params.get("actingMe");
    const actingModeRaw = params.get("actingMode");
    const actingFromIdx = parseIntSafe(params.get("actingFromIdx"));
    const actingToIdx = parseIntSafe(params.get("actingToIdx"));

    const out: Partial<UiPersistedStateV1> = {};
    if (tabRaw && isUiTab(tabRaw)) out.tab = tabRaw;
    if (site && site.trim()) out.breakSite = site.trim();
    if (typeof minutes === "number" && minutes > 0) out.breakMinutes = minutes;
    if (context && context.trim()) out.breakContext = context.trim();
    if (typeof actingScriptId === "number" && actingScriptId > 0) out.actingScriptId = actingScriptId;
    if (actingMe && actingMe.trim()) out.actingMe = actingMe.trim();
    if (actingModeRaw && isActingMode(actingModeRaw)) out.actingMode = actingModeRaw;
    if (typeof actingFromIdx === "number" && actingFromIdx > 0) out.actingFromIdx = actingFromIdx;
    if (typeof actingToIdx === "number" && actingToIdx > 0) out.actingToIdx = actingToIdx;
    return out;
  } catch {
    return {};
  }
}

export function readUiStateFromStorage(): Partial<UiPersistedStateV1> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as any;
    if (!parsed || parsed.v !== 1) return {};

    const out: Partial<UiPersistedStateV1> = {};
    if (isUiTab(parsed.tab)) out.tab = parsed.tab;
    if (typeof parsed.breakSite === "string" && parsed.breakSite.trim()) out.breakSite = parsed.breakSite.trim();
    if (typeof parsed.breakMinutes === "number" && Number.isFinite(parsed.breakMinutes) && parsed.breakMinutes > 0)
      out.breakMinutes = parsed.breakMinutes;
    if (typeof parsed.breakContext === "string" && parsed.breakContext.trim()) out.breakContext = parsed.breakContext.trim();

    if (typeof parsed.actingScriptId === "number" && Number.isFinite(parsed.actingScriptId) && parsed.actingScriptId > 0)
      out.actingScriptId = parsed.actingScriptId;
    if (typeof parsed.actingMe === "string" && parsed.actingMe.trim()) out.actingMe = parsed.actingMe.trim();
    if (typeof parsed.actingMode === "string" && isActingMode(parsed.actingMode)) out.actingMode = parsed.actingMode;
    if (typeof parsed.actingFromIdx === "number" && Number.isFinite(parsed.actingFromIdx) && parsed.actingFromIdx > 0)
      out.actingFromIdx = parsed.actingFromIdx;
    if (typeof parsed.actingToIdx === "number" && Number.isFinite(parsed.actingToIdx) && parsed.actingToIdx > 0)
      out.actingToIdx = parsed.actingToIdx;
    return out;
  } catch {
    return {};
  }
}

export function loadInitialUiState(defaults: UiPersistedStateV1): UiPersistedStateV1 {
  const fromStorage = readUiStateFromStorage();
  const fromUrl = readUiStateFromUrl();
  return {
    v: 1,
    tab: fromUrl.tab ?? fromStorage.tab ?? defaults.tab,
    breakSite: fromUrl.breakSite ?? fromStorage.breakSite ?? defaults.breakSite,
    breakMinutes: fromUrl.breakMinutes ?? fromStorage.breakMinutes ?? defaults.breakMinutes,
    breakContext: fromUrl.breakContext ?? fromStorage.breakContext ?? defaults.breakContext,
    actingScriptId: fromUrl.actingScriptId ?? fromStorage.actingScriptId ?? defaults.actingScriptId,
    actingMe: fromUrl.actingMe ?? fromStorage.actingMe ?? defaults.actingMe,
    actingMode: fromUrl.actingMode ?? fromStorage.actingMode ?? defaults.actingMode,
    actingFromIdx: fromUrl.actingFromIdx ?? fromStorage.actingFromIdx ?? defaults.actingFromIdx,
    actingToIdx: fromUrl.actingToIdx ?? fromStorage.actingToIdx ?? defaults.actingToIdx,
  };
}

export function persistUiState(state: UiPersistedStateV1): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function replaceUrlFromUiState(state: UiPersistedStateV1): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", state.tab ?? "break");
    if (state.breakSite) url.searchParams.set("breakSite", state.breakSite);
    else url.searchParams.delete("breakSite");
    if (typeof state.breakMinutes === "number") url.searchParams.set("breakMinutes", String(state.breakMinutes));
    else url.searchParams.delete("breakMinutes");
    if (state.breakContext) url.searchParams.set("breakContext", state.breakContext);
    else url.searchParams.delete("breakContext");

    if (typeof state.actingScriptId === "number") url.searchParams.set("actingScriptId", String(state.actingScriptId));
    else url.searchParams.delete("actingScriptId");
    if (state.actingMe) url.searchParams.set("actingMe", state.actingMe);
    else url.searchParams.delete("actingMe");
    if (state.actingMode) url.searchParams.set("actingMode", state.actingMode);
    else url.searchParams.delete("actingMode");
    if (typeof state.actingFromIdx === "number") url.searchParams.set("actingFromIdx", String(state.actingFromIdx));
    else url.searchParams.delete("actingFromIdx");
    if (typeof state.actingToIdx === "number") url.searchParams.set("actingToIdx", String(state.actingToIdx));
    else url.searchParams.delete("actingToIdx");
    window.history.replaceState(null, "", url.toString());
  } catch {
    // ignore
  }
}
