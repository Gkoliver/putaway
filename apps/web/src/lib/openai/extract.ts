import { getOpenAiClient } from "./client";

const EXTRACT_SYSTEM_PROMPT = `You extract household inventory voice commands from transcripts.
Return JSON with:
- intent: one of put_away, take_out, find, find_usual
- itemText: the item name when spoken
- quantity: positive integer when the user says a count (omit if not stated)
- locationPath: ordered location segments when a place is spoken (omit if none)`;

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: ["put_away", "take_out", "find", "find_usual"],
    },
    itemText: { type: "string" },
    quantity: { type: "integer", minimum: 1 },
    locationPath: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["intent"],
  additionalProperties: false,
} as const;

export async function extract(transcript: string): Promise<unknown> {
  const openai = getOpenAiClient();
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: EXTRACT_SYSTEM_PROMPT },
      { role: "user", content: transcript },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "inventory_command",
        strict: true,
        schema: EXTRACT_SCHEMA,
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI extract returned no content");
  }
  return JSON.parse(content) as unknown;
}
