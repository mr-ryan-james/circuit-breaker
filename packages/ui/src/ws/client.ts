export type WsMessage =
  | { type: "server.state"; now: string }
  | { type: "agent.signals.snapshot"; signals: Array<{ id: string; name: string; payload: unknown; created_at: string }> }
  | { type: "agent.signal"; id: string; name: string; payload: unknown; created_at: string }
  | {
      type: "run_lines.session";
      event: "started" | "ended" | "seeked" | "jumped" | "speed";
      session_id: string;
      script_id?: number;
      from?: number;
      to?: number;
      target_idx?: number;
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

export type WsClientMessage =
  | {
      type: "run_lines.start";
      script_id: number;
      from: number;
      to: number;
      mode: "practice" | "learn" | "read_through" | "speed_through";
      me: string;
      read_all: boolean;
      pause_mult?: number;
      pause_min_sec?: number;
      pause_max_sec?: number;
      cue_words?: number;
      reveal_after?: boolean;
      speed_mult?: number;
    }
  | { type: "run_lines.play"; session_id: string }
  | { type: "run_lines.stop"; session_id: string }
  | { type: "run_lines.seek"; session_id: string; from: number; to: number }
  | { type: "run_lines.jump"; session_id: string; target_idx: number }
  | { type: "run_lines.set_speed"; session_id: string; speed_mult: number }
  | { type: "run_lines.ack"; session_id: string; event_id?: string; status?: "done" | "error" };

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

export function sendWs(ws: WebSocket | null | undefined, msg: WsClientMessage): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(msg));
  return true;
}
