export type ScriptLineType = "dialogue" | "scene" | "action" | "parenthetical";

export interface ScriptCharacter {
  name: string;
  normalized_name: string;
  voice: string;
  rate: string;
  aliases: string[];
}

export interface ScriptLine {
  idx: number; // 1-based
  type: ScriptLineType;
  speaker_normalized?: string;
  text: string;
  scene_number?: number;
  scene_heading?: string;
}

export interface ScriptIR {
  script_id?: number;
  title: string;
  source_format: "colon" | "fountain";
  parser_version: number;
  characters: ScriptCharacter[];
  lines: ScriptLine[];
}

