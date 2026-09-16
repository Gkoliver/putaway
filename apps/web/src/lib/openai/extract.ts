import { getOpenAiClient } from "./client";

const EXTRACT_SYSTEM_PROMPT = `You extract household inventory voice commands from transcripts.
Return JSON with:
- intent: one of put_away, take_out, find, find_usual
- itemText: the item name when spoken (product only, e.g. "paper towels" not "a roll of paper towels"), or null if not stated / when listing many items
- quantity: positive integer when the user says a count for a single-item command, or null if not stated
- locationPath: location segments from outermost/room to innermost (e.g. ["basement","shelves","bottom shelf"]), or null if none
- items: for a ramble that lists multiple products in one place, an array of { itemText, quantity } (quantity null → treat as 1). Use null for normal single-item commands.
For take_out, ignore lead-ins like "took out" / "take out"; itemText is only the product.
When the user lists several things at one place (e.g. "on the bottom shelf … there is X, Y, and two bottles of Z"), set intent to put_away, fill locationPath, put each product in items, and set itemText to null.
Quantities: "two bottles of dawn" → dawn quantity 2; "a package of toilet paper" → toilet paper quantity 1. Do not invent large counts from packaging words like dozen unless the user said that number.`;

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
    items: {
      type: ["array", "null"],
      items: {
        type: "object",
        properties: {
          itemText: { type: "string" },
          quantity: { type: ["integer", "null"], minimum: 1 },
        },
        required: ["itemText", "quantity"],
        additionalProperties: false,
      },
    },
  },
  required: ["intent", "itemText", "quantity", "locationPath", "items"],
  additionalProperties: false,
} as const;

type ExtractPayload = {
  intent: string;
  itemText: string | null;
  quantity: number | null;
  locationPath: string[] | null;
  items: { itemText: string; quantity: number | null }[] | null;
};

function normalizeExtractPayload(payload: ExtractPayload): unknown {
  return {
    intent: payload.intent,
    ...(payload.itemText != null ? { itemText: payload.itemText } : {}),
    ...(payload.quantity != null ? { quantity: payload.quantity } : {}),
    ...(payload.locationPath != null ? { locationPath: payload.locationPath } : {}),
    ...(payload.items != null
      ? {
          items: payload.items.map((line) => ({
            itemText: line.itemText,
            ...(line.quantity != null ? { quantity: line.quantity } : {}),
          })),
        }
      : {}),
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
