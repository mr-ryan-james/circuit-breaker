export type WsMessage =
  | { type: "server.state"; now: string }
  | { type: "agent.signals.snapshot"; signals: Array<{ id: string; name: string; payload: unknown; created_at: string }> }
  | { type: "agent.signal"; id: string; name: string; payload: unknown; created_at: string }
  | {
      type: "run_lines.session";
      event: "started" | "ended" | "seeked" | "speed";
      session_id: string;
      script_id?: number;
      from?: number;
      to?: number;
      speed_mult?: number;
    }
  | {
      type: "run_lines.event";
      session_id: string;
      event_id: string;
      kind: "direction" | "line" | "pause" | "gap";
      idx: number;
      text?: string;
      speaker?: string | null;
      audio?: { id: string; url: string; duration_sec: number };
      duration_sec?: number;
      cue?: string | null;
      playback_rate?: number;
    }
  | { type: "error"; scope: string; message: string }
  | { type: string; [k: string]: any };

export function connectWs(onMessage: (m: WsMessage) => void, token: string): WebSocket {
  const qs = `?token=${encodeURIComponent(token)}`;
  const wsUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws${qs}`;
  const ws = new WebSocket(wsUrl);
  ws.onmessage = (evt) => {
    try {
      onMessage(JSON.parse(String(evt.data)) as WsMessage);
    } catch {
      onMessage({ type: "error", scope: "ws", message: "invalid_json_from_server" });
    }
  };
  return ws;
}
