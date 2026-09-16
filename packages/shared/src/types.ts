export const INTENTS = ["put_away", "take_out", "find", "find_usual"] as const;
export type Intent = (typeof INTENTS)[number];

export const defaultQuantity = 1;

export function isIntent(value: string): value is Intent {
  return (INTENTS as readonly string[]).includes(value);
}

export type LocationPath = string[];

export type BatchLine = {
  itemText: string;
  quantity: number;
};

export type SingleInventoryCommand = {
  intent: Intent;
  itemText: string;
  quantity: number;
  locationPath?: LocationPath;
  locationId?: string;
  itemId?: string;
};

export type PutAwayBatchCommand = {
  intent: "put_away_batch";
  locationPath: LocationPath;
  locationId?: string;
  items: BatchLine[];
  confirmed?: boolean;
};

export type InventoryCommand = SingleInventoryCommand | PutAwayBatchCommand;

export function isPutAwayBatchCommand(
  command: InventoryCommand,
): command is PutAwayBatchCommand {
  return command.intent === "put_away_batch";
}

export function isSingleInventoryCommand(
  command: InventoryCommand,
): command is SingleInventoryCommand {
  return command.intent !== "put_away_batch";
}

export type LocationCandidate = {
  locationId: string;
  pathLabel: string;
  quantity: number;
};

export type ItemCandidate = {
  itemId: string;
  name: string;
};

export type Clarification =
  | { type: "which_location"; candidates: LocationCandidate[] }
  | { type: "which_item"; candidates: ItemCandidate[] }
  | {
      type: "confirm_batch";
      locationPath: LocationPath;
      pathLabel: string;
      items: BatchLine[];
    }
  | { type: "follow_up"; message: string };

export type LotSnapshot = {
  locationId: string;
  pathLabel: string;
  quantity: number;
};

export type CommandOk = {
  type: "ok";
  spoken: string;
  itemId: string;
  itemName: string;
  lots: LotSnapshot[];
};

export type CommandClarification = {
  type: "clarification";
  spoken: string;
  clarification: Clarification;
  command?: InventoryCommand;
};

export type CommandErrorCode =
  | "empty_transcript"
  | "unknown_item"
  | "unknown_location"
  | "forbidden"
  | "voice_unavailable"
  | "invalid_merge"
  | "not_caught";

export type CommandError = {
  type: "error";
  spoken: string;
  code: CommandErrorCode;
};

export type CommandOutcome = CommandOk | CommandClarification | CommandError;

export function pathLabelFromSegments(segments: string[]): string {
  return segments
    .map((segment) =>
      segment
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" "),
    )
    .filter(Boolean)
    .join(" → ");
}
