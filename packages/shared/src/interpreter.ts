import { z } from "zod";
import { defaultQuantity, isIntent, type Intent, type InventoryCommand } from "./types";

export type InterpreterPayload = {
  intent: Intent;
  itemText: string;
  quantity?: number;
  locationPath?: string[];
};

const payloadSchema = z.object({
  intent: z.enum(["put_away", "take_out", "find", "find_usual"]),
  itemText: z.string().min(1).optional(),
  quantity: z.number().int().positive().optional(),
  locationPath: z.array(z.string().min(1)).optional(),
});

const FOLLOW_UP_MESSAGE = "What item do you mean?";

export function parseInterpreterOutput(
  raw: unknown,
): InventoryCommand | { type: "follow_up"; message: string } {
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    return { type: "follow_up", message: FOLLOW_UP_MESSAGE };
  }

  const { intent, itemText, quantity, locationPath } = parsed.data;

  if (!isIntent(intent) || !itemText) {
    return { type: "follow_up", message: FOLLOW_UP_MESSAGE };
  }

  const command: InventoryCommand = {
    intent,
    itemText,
    quantity: quantity ?? defaultQuantity,
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
    return {
      type: "error",
      code: "voice_unavailable",
      spoken: "Voice is unavailable — type it instead.",
    };
  }
}
