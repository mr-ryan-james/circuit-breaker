export type ScriptRow = { id: number; title: string; source_format: string; created_at: string };
export type CharacterRow = { normalized_name: string; name: string; voice: string; rate: string };
export type LineRow = {
  idx: number;
  type: string;
  speaker_normalized: string | null;
  text: string;
  scene_number: number | null;
  scene_heading: string | null;
};

export type Signal = { id: string; name: string; payload: unknown; created_at: string };

export type TimelineItem = {
  key: string;
  kind: "direction" | "line" | "gap" | "pause";
  idx: number;
  speaker: string | null;
  text: string | null;
  revealed: boolean;
  cue: string | null;
};

export type BreakMenuLane =
  | { type: "same_need"; prompt: string }
  | { type: "feed"; site: string; minutes: number; command: string }
  | { type: string; card?: any; recent_scripts?: any[] };

export type BreakMenu = {
  event_key: string;
  site: string;
  lanes: BreakMenuLane[];
};

export type SpanishBrain = {
  v: 1;
  assistant_text: string;
  tool_requests: Array<any>;
  await: "user" | "listen_result" | "done";
};

export type SpanishSpeakResult = { id: string; tool: "speak"; audio_id: string; url: string; duration_sec: number };
export type SpanishPendingListen = { id: string; tool: "listen"; target_text: string };

export type SpanishSessionRow = {
  id: string;
  created_at: string;
  updated_at: string;
  status: "open" | "completed" | "abandoned";
  source: string;
  event_key: string | null;
  lane: string | null;
  card_id: number | null;
  card_key: string | null;
  card_prompt: string | null;
  codex_thread_id: string | null;
  brain_name: string | null;
  brain_thread_id: string | null;
  pending_tool_json: string | null;
};

export type SpanishTurnRow = {
  id: string;
  session_id: string;
  idx: number;
  role: string;
  kind: string;
  content: string | null;
  json: string | null;
  created_at: string;
};

export type SpanishMessage = {
  role: "tutor" | "you" | "system";
  text: string;
  timestamp: number;
  speakResults?: SpanishSpeakResult[];
};

export type BrainDefault = "codex" | "claude";

export type SovtCmdStep = {
  idx: number;
  title: string;
  raw_cmd: string;
  args: string[];
  status: "pending" | "running" | "done" | "error";
  started_at_ms: number | null;
  ended_at_ms: number | null;
  result_json: string | null;
  error: string | null;
};

export type AllGravyPrStatus = "new_unreviewed" | "waiting" | "ready_to_approve";
export type AllGravyProposalStatus = "proposed" | "applied" | "discarded" | "failed";

export type AllGravyPrRow = {
  id: string;
  run_id: string;
  refreshed_at: string;
  gh_login: string;
  repo: string;
  pr_number: number;
  pr_url: string;
  title: string;
  author_login: string | null;
  head_sha: string;
  status: AllGravyPrStatus;
  thread_summary_json: string;
  patches_json: string | null;
  created_at: string;
  updated_at: string;
};

export type AllGravyProposalRow = {
  id: string;
  pr_id: string;
  repo: string;
  pr_number: number;
  head_sha: string;
  commit_id: string;
  path: string;
  position: number;
  body: string;
  status: AllGravyProposalStatus;
  gh_command: string | null;
  apply_result_json: string | null;
  created_at: string;
  updated_at: string;
};
