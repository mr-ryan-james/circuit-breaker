import { z } from "zod";

export const SpanishVoiceSchema = z.enum([
  "es-ES-AlvaroNeural",
  "es-ES-ElviraNeural",
  "es-MX-JorgeNeural",
  "es-MX-DaliaNeural",
]);

export const SpanishToolRequestSchema = z.discriminatedUnion("tool", [
  z.object({
    id: z.string().min(1),
    tool: z.literal("speak"),
    args: z.object({
      text: z.string().min(1).max(400),
      voice: SpanishVoiceSchema,
      rate: z.string().regex(/^[+-]?\d+%$/),
    }),
  }),
  z.object({
    id: z.string().min(1),
    tool: z.literal("listen"),
    args: z.object({
      target_text: z.string().min(1).max(400),
    }),
  }),
]);

export const SpanishBrainOutputSchema = z.object({
  v: z.literal(1),
  assistant_text: z.string().min(1).max(12_000),
  tool_requests: z.array(SpanishToolRequestSchema).max(8),
  await: z.enum(["user", "listen_result", "done"]),
});

export type SpanishBrainOutput = z.infer<typeof SpanishBrainOutputSchema>;

/**
 * JSON Schema representation for use with Claude's --json-schema flag.
 * Must stay in sync with SpanishBrainOutputSchema above.
 */
export const SpanishBrainOutputJsonSchema = {
  type: "object" as const,
  required: ["v", "assistant_text", "tool_requests", "await"],
  additionalProperties: false,
  properties: {
    v: { type: "integer" as const, const: 1 },
    assistant_text: { type: "string" as const, minLength: 1, maxLength: 12000 },
    tool_requests: {
      type: "array" as const,
      maxItems: 8,
      items: {
        oneOf: [
          {
            type: "object" as const,
            required: ["id", "tool", "args"],
            additionalProperties: false,
            properties: {
              id: { type: "string" as const, minLength: 1 },
              tool: { type: "string" as const, const: "speak" },
              args: {
                type: "object" as const,
                required: ["text", "voice", "rate"],
                additionalProperties: false,
                properties: {
                  text: { type: "string" as const, minLength: 1, maxLength: 400 },
                  voice: {
                    type: "string" as const,
                    enum: ["es-ES-AlvaroNeural", "es-ES-ElviraNeural", "es-MX-JorgeNeural", "es-MX-DaliaNeural"],
                  },
                  rate: { type: "string" as const, pattern: "^[+-]?\\d+%$" },
                },
              },
            },
          },
          {
            type: "object" as const,
            required: ["id", "tool", "args"],
            additionalProperties: false,
            properties: {
              id: { type: "string" as const, minLength: 1 },
              tool: { type: "string" as const, const: "listen" },
              args: {
                type: "object" as const,
                required: ["target_text"],
                additionalProperties: false,
                properties: {
                  target_text: { type: "string" as const, minLength: 1, maxLength: 400 },
                },
              },
            },
          },
        ],
      },
    },
    await: { type: "string" as const, enum: ["user", "listen_result", "done"] },
  },
};
