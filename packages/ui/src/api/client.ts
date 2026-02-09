export type ApiStatus = {
  ok: boolean;
  pid?: number;
  port?: number;
  ui_url?: string | null;
  ws_url?: string | null;
  started_at?: string;
  sudo_site_toggle_ok?: boolean;
};

let token: string | null = null;

export function getToken(): string | null {
  return token;
}

export async function fetchStatus(): Promise<ApiStatus> {
  const res = await fetch("/api/status", { cache: "no-store" });
  const data = (await res.json()) as ApiStatus;

  // Token is provided via response header (not JSON) to reduce accidental logging.
  token = res.headers.get("x-cb-token") ?? null;
  return data;
}

async function ensureToken(): Promise<string> {
  if (token) return token;
  const s = await fetchStatus();
  if (!token) throw new Error("Missing token (server did not provide one)");
  return token;
}

export async function callAction<T = any>(action: string, payload: unknown): Promise<T> {
  // Token is rotated on every server start. The UI can remain open across restarts,
  // so we refresh and retry once when we get a token error.
  const makeReq = async (t: string) =>
    fetch("/api/action", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cb-token": t,
      },
      body: JSON.stringify({ v: 1, action, payload }),
    });

  let t = await ensureToken();
  let res = await makeReq(t);

  if (res.status === 403) {
    const first = (await res.json().catch(() => null)) as any;
    if (first?.error === "missing_or_bad_token") {
      try {
        await fetchStatus();
        t = await ensureToken();
        res = await makeReq(t);
      } catch {
        return first as T;
      }
    } else {
      return first as T;
    }
  }

  return (await res.json()) as T;
}
