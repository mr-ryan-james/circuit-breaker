import { z } from "zod";

export const AllGravyProposalSchema = z.object({
  path: z.string().min(1).max(500),
  position: z.number().int().positive(),
  body: z.string().min(1).max(2000),
});

export const AllGravyBrainOutputSchema = z.object({
  v: z.literal(1),
  assistant_text: z.string().min(1).max(4000),
  proposals: z.array(AllGravyProposalSchema).max(2),
  await: z.literal("done"),
});

export type AllGravyBrainOutput = z.infer<typeof AllGravyBrainOutputSchema>;

/**
 * JSON Schema representation for use with Claude's --json-schema flag.
 * Must stay in sync with AllGravyBrainOutputSchema above.
 */
export const AllGravyBrainOutputJsonSchema = {
  type: "object" as const,
  required: ["v", "assistant_text", "proposals", "await"],
  additionalProperties: false,
  properties: {
    v: { type: "integer" as const, const: 1 },
    assistant_text: { type: "string" as const, minLength: 1, maxLength: 4000 },
    proposals: {
      type: "array" as const,
      maxItems: 2,
      items: {
        type: "object" as const,
        required: ["path", "position", "body"],
        additionalProperties: false,
        properties: {
          path: { type: "string" as const, minLength: 1, maxLength: 500 },
          position: { type: "integer" as const, minimum: 1 },
          body: { type: "string" as const, minLength: 1, maxLength: 2000 },
        },
      },
    },
    await: { type: "string" as const, enum: ["done"] },
  },
};

