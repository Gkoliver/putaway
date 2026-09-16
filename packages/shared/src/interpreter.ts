import { z } from "zod";
import {
  defaultQuantity,
  isIntent,
  type Intent,
  type InventoryCommand,
} from "./types";

export type InterpreterPayload = {
  intent: Intent;
  itemText: string;
  quantity?: number;
  locationPath?: string[];
  items?: { itemText: string; quantity?: number }[];
};

const batchLineSchema = z.object({
  itemText: z.string().min(1),
  quantity: z.number().int().positive().optional(),
});

const payloadSchema = z.object({
  intent: z.enum(["put_away", "take_out", "find", "find_usual"]),
  itemText: z.string().min(1).optional(),
  quantity: z.number().int().positive().optional(),
  locationPath: z.array(z.string().min(1)).optional(),
  items: z.array(batchLineSchema).optional(),
});

const FOLLOW_UP_MESSAGE = "What item do you mean?";

const WORD_QUANTITIES: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

function spokenLocationPath(locationPhrase: string): string[] {
  const segments = locationPhrase
    .replace(/^(?:in|on)\s+/i, "")
    .split(/\s+(?:in|on)\s+/)
    .map((part) => part.replace(/^(?:the|a)\s+/i, "").trim())
    .filter(Boolean);
  if (segments.length <= 1) return segments;

  const preps: string[] = [];
  const prepRe = /\b(in|on)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = prepRe.exec(locationPhrase))) {
    preps.push(match[1].toLowerCase());
  }

  const firstOn = preps.indexOf("on");
  const firstIn = preps.indexOf("in");
  // "on the shelf in the basement" → specific → general → reverse to root-first
  if (firstOn !== -1 && firstIn !== -1 && firstOn < firstIn) {
    return segments.reverse();
  }
  // "in the basement on the shelves" → already root-first
  if (firstIn !== -1 && firstOn !== -1 && firstIn < firstOn) {
    return segments;
  }
  // All "on" or all "in" chains are usually specific → general
  return segments.reverse();
}

function stripPutAwayLeadIn(text: string): string {
  return text.replace(/^(?:i(?:['’]m| am)?\s+)?(?:put(?:ting)?(?:\s+away)?)\s+/i, "").trim();
}

function splitLeadingQuantity(itemText: string): { itemText: string; quantity: number } {
  const words = Object.keys(WORD_QUANTITIES).join("|");
  const match = itemText.match(
    new RegExp(`^(?:(\\d{1,2})|(${words}))\\s+(?:of\\s+)?(.+)$`, "i"),
  );
  const rest = match?.[3]?.trim();
  if (!match || !rest) {
    return { itemText, quantity: defaultQuantity };
  }
  const quantity = match[1]
    ? Number(match[1])
    : (WORD_QUANTITIES[match[2].toLowerCase()] ?? defaultQuantity);
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { itemText, quantity: defaultQuantity };
  }
  return { itemText: rest, quantity };
}

function stripUnitOfPhrase(text: string): string {
  return text
    .replace(/^(?:a|an|\d+)\s+(?:rolls?|packs?|boxes?|bottles?|cans?|bags?|cases?)\s+of\s+/i, "")
    .trim();
}

function spokenItem(raw: string): { itemText: string; quantity: number } {
  return splitLeadingQuantity(stripPutAwayLeadIn(raw));
}

function spokenTakeOutItem(raw: string): { itemText: string; quantity: number } {
  const cleaned = stripUnitOfPhrase(raw.replace(/^(?:the\s+)/i, "").trim());
  return splitLeadingQuantity(cleaned);
}

function parseSpokenFallback(transcript: string): InventoryCommand | null {
  const putting = transcript.match(
    /(?:i(?:['’]m| am) putting|putting)\s+(.+?)\s+((?:in|on)\s+(?:the\s+)?.+)$/i,
  );
  if (putting) {
    const item = spokenItem(putting[1]);
    return {
      intent: "put_away",
      itemText: item.itemText,
      quantity: item.quantity,
      locationPath: spokenLocationPath(putting[2]),
    };
  }
  const itemInPlace = transcript.match(/^(.+?)\s+((?:in|on)\s+(?:the\s+)?.+)$/i);
  if (itemInPlace) {
    const item = spokenItem(itemInPlace[1]);
    if (!item.itemText) return null;
    return {
      intent: "put_away",
      itemText: item.itemText,
      quantity: item.quantity,
      locationPath: spokenLocationPath(itemInPlace[2]),
    };
  }
  const findUsual = transcript.match(/where do we (?:normally )?store\s+(.+)$/i);
  if (findUsual) {
    return {
      intent: "find_usual",
      itemText: splitLeadingQuantity(findUsual[1].replace(/^(?:the\s+)/i, "").trim())
        .itemText,
      quantity: defaultQuantity,
    };
  }
  const find = transcript.match(/where (?:are|is)\s+(?:the\s+)?(.+)$/i);
  if (find) {
    return {
      intent: "find",
      itemText: splitLeadingQuantity(find[1].trim()).itemText,
      quantity: defaultQuantity,
    };
  }
  const takeOut = transcript.match(
    /(?:i(?:['’]ve| have)?\s+taken(?:\s+out)?|i took(?:\s+out)?|took(?:\s+out)?|take(?:\s+out)?)\s+(?:(\d+)\s+)?(.+)$/i,
  );
  if (takeOut) {
    const item = spokenTakeOutItem(takeOut[2]);
    return {
      intent: "take_out",
      itemText: item.itemText,
      quantity: takeOut[1] ? Number(takeOut[1]) : item.quantity,
    };
  }
  return null;
}

export function parseInterpreterOutput(
  raw: unknown,
): InventoryCommand | { type: "follow_up"; message: string } {
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    return { type: "follow_up", message: FOLLOW_UP_MESSAGE };
  }

  const { intent, itemText, quantity, locationPath, items } = parsed.data;

  if (!isIntent(intent)) {
    return { type: "follow_up", message: FOLLOW_UP_MESSAGE };
  }

  const batchItems =
    items
      ?.map((line) => ({
        itemText: line.itemText.trim(),
        quantity: line.quantity ?? defaultQuantity,
      }))
      .filter((line) => line.itemText.length > 0) ?? [];

  // Auto-detect ramble: put-away with 2+ items and a location path.
  if (intent === "put_away" && batchItems.length >= 2 && locationPath && locationPath.length > 0) {
    return {
      intent: "put_away_batch",
      locationPath,
      items: batchItems,
    };
  }

  if (!itemText) {
    return { type: "follow_up", message: FOLLOW_UP_MESSAGE };
  }

  let cleanedItem = itemText.trim();
  let cleanedQuantity = quantity ?? defaultQuantity;
  if (intent === "take_out") {
    const taken = spokenTakeOutItem(cleanedItem.replace(/^out\s+/i, ""));
    cleanedItem = taken.itemText;
    if (quantity == null) cleanedQuantity = taken.quantity;
  }

  const command: InventoryCommand = {
    intent,
    itemText: cleanedItem,
    quantity: cleanedQuantity,
  };

  if (locationPath !== undefined) {
    command.locationPath = locationPath;
  }

  return command;
}

export async function interpretTranscript(
  transcript: string,
  extract: (transcript: string) => Promise<unknown>,
): Promise<
  | InventoryCommand
  | { type: "follow_up"; message: string }
  | {
      type: "error";
      code: "empty_transcript" | "not_caught" | "voice_unavailable";
      spoken: string;
    }
> {
  const trimmed = transcript.trim();
  if (!trimmed) {
    return {
      type: "error",
      code: "empty_transcript",
      spoken: "I didn't catch that.",
    };
  }

  try {
    const raw = await extract(trimmed);
    return parseInterpreterOutput(raw);
  } catch {
    const fallback = parseSpokenFallback(trimmed);
    if (fallback) return fallback;
    return {
      type: "error",
      code: "voice_unavailable",
      spoken: "Voice is unavailable — type it instead.",
    };
  }
}
