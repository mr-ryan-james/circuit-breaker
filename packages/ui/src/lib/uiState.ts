export type UiTab = "break" | "acting" | "spanish" | "sovt" | "signals" | "status";

export type UiPersistedStateV1 = {
  v: 1;
  tab?: UiTab;
  breakSite?: string;
  breakMinutes?: number;
  breakContext?: string;
};

const STORAGE_KEY = "circuit_breaker_ui_state_v1";

function isUiTab(v: unknown): v is UiTab {
  return (
    v === "break" ||
    v === "acting" ||
    v === "spanish" ||
    v === "sovt" ||
    v === "signals" ||
    v === "status"
  );
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

    const out: Partial<UiPersistedStateV1> = {};
    if (tabRaw && isUiTab(tabRaw)) out.tab = tabRaw;
    if (site && site.trim()) out.breakSite = site.trim();
    if (typeof minutes === "number" && minutes > 0) out.breakMinutes = minutes;
    if (context && context.trim()) out.breakContext = context.trim();
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
    if (typeof state.breakMinutes === "number") url.searchParams.set("breakMinutes", String(state.breakMinutes));
    if (state.breakContext) url.searchParams.set("breakContext", state.breakContext);
    window.history.replaceState(null, "", url.toString());
  } catch {
    // ignore
  }
}

