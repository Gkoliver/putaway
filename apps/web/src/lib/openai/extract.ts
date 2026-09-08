import { getOpenAiClient } from "./client";

const EXTRACT_SYSTEM_PROMPT = `You extract household inventory voice commands from transcripts.
Return JSON with:
- intent: one of put_away, take_out, find, find_usual
- itemText: the item name when spoken, or null if not stated
- quantity: positive integer when the user says a count, or null if not stated
- locationPath: ordered location segments when a place is spoken, or null if none`;

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: ["put_away", "take_out", "find", "find_usual"],
    },
    itemText: { type: ["string", "null"] },
    quantity: { type: ["integer", "null"], minimum: 1 },
    locationPath: {
      type: ["array", "null"],
      items: { type: "string" },
    },
  },
  required: ["intent", "itemText", "quantity", "locationPath"],
  additionalProperties: false,
} as const;

type ExtractPayload = {
  intent: string;
  itemText: string | null;
  quantity: number | null;
  locationPath: string[] | null;
};

function normalizeExtractPayload(payload: ExtractPayload): unknown {
  return {
    intent: payload.intent,
    ...(payload.itemText != null ? { itemText: payload.itemText } : {}),
    ...(payload.quantity != null ? { quantity: payload.quantity } : {}),
    ...(payload.locationPath != null ? { locationPath: payload.locationPath } : {}),
  };
}

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
  const parsed = JSON.parse(content) as ExtractPayload;
  return normalizeExtractPayload(parsed);
}
