export interface ModuleMatchV1 {
  // Card belongs to module if it has ANY of these tags.
  tags_any: string[];
}

export interface ModuleCompletionV1 {
  // Optional suggestions for completion `--parts` (not enforced).
  parts_suggestions?: string[];
}

export interface ModuleDefinitionV1 {
  version: 1;
  slug: string;
  name: string;
  match: ModuleMatchV1;
  completion?: ModuleCompletionV1;
}

export type ModuleDefinition = ModuleDefinitionV1;

