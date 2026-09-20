import { and, eq } from "drizzle-orm";
import type {
  CommandOutcome,
  InventoryCommand,
  ItemCandidate,
  LocationCandidate,
  LotSnapshot,
  PutAwayBatchCommand,
  SingleInventoryCommand,
} from "@putaway/shared";
import { isPutAwayBatchCommand } from "@putaway/shared";
import type { Database } from "../db/client";
import { items, locations } from "../db/schema";
import { requireMembership } from "../households";
import { resolveItem, type ItemSuggester } from "./items";
import { pathLabelFor, resolveLocationPath } from "./locations";
import { decrementLot, incrementLot, listLotsForItem, type LotListRow } from "./lots";
import { suggestItemMatches } from "../openai/suggestItems";

class RollbackOutcome extends Error {
  constructor(readonly outcome: CommandOutcome) {
    super("rollback");
  }
}

export type HandleCommandDeps = {
  suggestItems?: ItemSuggester;
};

export async function handleCommand(
  db: Database,
  input: { userId: string; householdId: string; command: InventoryCommand },
  deps: HandleCommandDeps = {},
): Promise<CommandOutcome> {
  const membership = await requireMembership(db, input.userId, input.householdId);
  if (!membership) {
    return { type: "error", code: "forbidden", spoken: "You don't have access to that household." };
  }

  try {
    return await db.transaction(async (tx) => {
      const outcome = await applyCommand(
        tx as unknown as Database,
        input.householdId,
        input.command,
        deps,
      );
      if (outcome.type === "error") {
        throw new RollbackOutcome(outcome);
      }
      return outcome;
    });
  } catch (error) {
    if (error instanceof RollbackOutcome) return error.outcome;
    throw error;
  }
}

async function applyCommand(
  db: Database,
  householdId: string,
  command: InventoryCommand,
  deps: HandleCommandDeps,
): Promise<CommandOutcome> {
  if (isPutAwayBatchCommand(command)) {
    return applyPutAwayBatch(db, householdId, command);
  }

  const create = command.intent === "put_away";
  const item = await resolveCommandItem(db, householdId, command, create, deps);
  if (item.type !== "resolved") return item;

  const location = await resolveCommandLocation(db, householdId, command, create, item.itemId);
  if (location && location.type !== "resolved") return location;

  const at = new Date();

  if (command.intent === "put_away") {
    if (!location || location.type !== "resolved") {
      return unknownLocation(command.locationPath?.[0] ?? "that place");
    }
    const lotError = lotQuantityError(command.quantity);
    if (lotError) return lotError;
    let incremented;
    try {
      incremented = await incrementLot(db, {
        householdId,
        itemId: item.itemId,
        locationId: location.locationId,
        quantity: command.quantity,
        at,
      });
    } catch (error) {
      return mapLotWriteError(error, {
        segment: command.locationPath?.[0] ?? location.pathLabel,
        itemText: command.itemText,
      });
    }
    const lots = await snapshots(db, householdId, item.itemId);
    return {
      type: "ok",
      spoken: `Added ${command.quantity} ${item.name} to ${location.pathLabel}. Now ${incremented.quantity}.`,
      itemId: item.itemId,
      itemName: item.name,
      lots,
    };
  }

  if (command.intent === "take_out") {
    return takeOut(db, {
      householdId,
      command,
      itemId: item.itemId,
      name: item.name,
      location: location?.type === "resolved" ? location : undefined,
      at,
    });
  }

  const allLots = await listLotsForItem(db, { householdId, itemId: item.itemId, inStockOnly: false });
  const inStock = allLots.filter((lot) => lot.quantity > 0);
  const lots = toSnapshots(allLots);

  if (command.intent === "find") {
    if (inStock.length > 0) {
      return {
        type: "ok",
        spoken: inStock
          .map((lot) => `${item.name} — ${lot.pathLabel} (${lot.quantity})`)
          .join("; "),
        itemId: item.itemId,
        itemName: item.name,
        lots,
      };
    }
    const usual = rankUsual(allLots);
    if (!usual) {
      return unknownLocation(command.locationPath?.[0] ?? "that place");
    }
    return {
      type: "ok",
      spoken: `You're out. You usually keep them in ${usual.pathLabel}.`,
      itemId: item.itemId,
      itemName: item.name,
      lots,
    };
  }

  const usual = rankUsual(allLots);
  if (!usual) {
    return unknownLocation(command.locationPath?.[0] ?? "that place");
  }
  return {
    type: "ok",
    spoken: `You usually store ${item.name} at ${usual.pathLabel}.`,
    itemId: item.itemId,
    itemName: item.name,
    lots,
  };
}

async function takeOut(
  db: Database,
  {
    householdId,
    command,
    itemId,
    name,
    location,
    at,
  }: {
    householdId: string;
    command: SingleInventoryCommand;
    itemId: string;
    name: string;
    location?: { locationId: string; pathLabel: string };
    at: Date;
  },
): Promise<CommandOutcome> {
  if (location) {
    return decrementAt(db, {
      householdId,
      itemId,
      name,
      locationId: location.locationId,
      pathLabel: location.pathLabel,
      quantity: command.quantity,
      at,
    });
  }

  const allLots = await listLotsForItem(db, { householdId, itemId, inStockOnly: false });
  const inStock = allLots.filter((lot) => lot.quantity > 0);

  if (inStock.length > 1) {
    const candidates: LocationCandidate[] = inStock.map((lot) => ({
      locationId: lot.locationId,
      pathLabel: lot.pathLabel,
      quantity: lot.quantity,
    }));
    return {
      type: "clarification",
      spoken: `${candidates.map((c) => `${c.pathLabel} (${c.quantity})`).join(" or ")}?`,
      clarification: { type: "which_location", candidates },
    };
  }

  const target = inStock[0] ?? rankUsual(allLots);
  if (!target) {
    return unknownLocation(command.locationPath?.[0] ?? "that place");
  }

  return decrementAt(db, {
    householdId,
    itemId,
    name,
    locationId: target.locationId,
    pathLabel: target.pathLabel,
    quantity: command.quantity,
    at,
  });
}

async function decrementAt(
  db: Database,
  {
    householdId,
    itemId,
    name,
    locationId,
    pathLabel,
    quantity,
    at,
  }: {
    householdId: string;
    itemId: string;
    name: string;
    locationId: string;
    pathLabel: string;
    quantity: number;
    at: Date;
  },
): Promise<CommandOutcome> {
  const lotError = lotQuantityError(quantity);
  if (lotError) return lotError;
  let decremented;
  try {
    decremented = await decrementLot(db, { householdId, itemId, locationId, quantity, at });
  } catch (error) {
    return mapLotWriteError(error, { segment: pathLabel, itemText: name });
  }
  const lots = await snapshots(db, householdId, itemId);
  const spoken = decremented.clamped
    ? `Only ${decremented.previousQuantity} left in ${pathLabel}. Marked 0.`
    : `Took ${quantity} ${name} from ${pathLabel}. Now ${decremented.quantity}.`;
  return { type: "ok", spoken, itemId, itemName: name, lots };
}

async function applyPutAwayBatch(
  db: Database,
  householdId: string,
  command: PutAwayBatchCommand,
): Promise<CommandOutcome> {
  if (!command.confirmed) {
    return {
      type: "error",
      code: "not_caught",
      spoken: "Confirm the list before I save it.",
    };
  }
  if (!command.locationPath.length || command.items.length < 2) {
    return { type: "error", code: "not_caught", spoken: "I didn't catch that." };
  }

  const at = new Date();
  const location = await resolveLocationPath(db, {
    householdId,
    segments: command.locationPath,
    create: true,
  });
  if (!location.ok) {
    return { type: "error", code: "unknown_location", spoken: location.spoken };
  }

  const lines: string[] = [];
  let lastItemId = "";
  let lastItemName = "";

  for (const line of command.items) {
    const lotError = lotQuantityError(line.quantity);
    if (lotError) return lotError;
    const item = await resolveItem(db, {
      householdId,
      itemText: line.itemText,
      create: true,
    });
    if (!item.ok) {
      return { type: "error", code: "unknown_item", spoken: item.spoken };
    }
    try {
      const incremented = await incrementLot(db, {
        householdId,
        itemId: item.itemId,
        locationId: location.locationId,
        quantity: line.quantity,
        at,
      });
      lines.push(`${line.quantity} ${item.name} (now ${incremented.quantity})`);
      lastItemId = item.itemId;
      lastItemName = item.name;
    } catch (error) {
      return mapLotWriteError(error, {
        segment: location.pathLabel,
        itemText: line.itemText,
      });
    }
  }

  const lots = await snapshots(db, householdId, lastItemId);
  return {
    type: "ok",
    spoken: `Added to ${location.pathLabel}: ${lines.join("; ")}.`,
    itemId: lastItemId,
    itemName: lastItemName,
    lots,
  };
}

async function resolveCommandItem(
  db: Database,
  householdId: string,
  command: SingleInventoryCommand,
  create: boolean,
  deps: HandleCommandDeps,
): Promise<
  | { type: "resolved"; itemId: string; name: string }
  | CommandOutcome
> {
  if (command.itemId) {
    const [row] = await db
      .select({ id: items.id, name: items.name })
      .from(items)
      .where(and(eq(items.id, command.itemId), eq(items.householdId, householdId)))
      .limit(1);
    if (!row) {
      return { type: "error", code: "unknown_item", spoken: `I don't have ${command.itemText} yet.` };
    }
    return { type: "resolved", itemId: row.id, name: row.name };
  }

  const resolved = await resolveItem(db, {
    householdId,
    itemText: command.itemText,
    create,
    suggest: create ? undefined : (deps.suggestItems ?? suggestItemMatches),
  });
  if (resolved.ok) {
    return { type: "resolved", itemId: resolved.itemId, name: resolved.name };
  }
  if (resolved.code === "ambiguous_item") {
    const candidates: ItemCandidate[] = resolved.candidates ?? [];
    return {
      type: "clarification",
      spoken: resolved.spoken,
      clarification: { type: "which_item", candidates },
    };
  }
  return { type: "error", code: "unknown_item", spoken: resolved.spoken };
}

async function resolveCommandLocation(
  db: Database,
  householdId: string,
  command: SingleInventoryCommand,
  create: boolean,
  itemId: string,
): Promise<
  | { type: "resolved"; locationId: string; pathLabel: string }
  | CommandOutcome
  | undefined
> {
  if (command.locationId) {
    const [row] = await db
      .select({ id: locations.id, name: locations.name, archivedAt: locations.archivedAt })
      .from(locations)
      .where(and(eq(locations.id, command.locationId), eq(locations.householdId, householdId)))
      .limit(1);
    if (!row || row.archivedAt) {
      return unknownLocation(row?.name ?? "that place");
    }
    return {
      type: "resolved",
      locationId: row.id,
      pathLabel: await pathLabelFor(db, householdId, row.id),
    };
  }

  if (!command.locationPath) return undefined;

  const resolved = await resolveLocationPath(db, {
    householdId,
    segments: command.locationPath,
    create,
  });
  if (resolved.ok) {
    return { type: "resolved", locationId: resolved.locationId, pathLabel: resolved.pathLabel };
  }
  if (resolved.code === "ambiguous_location") {
    const lots = await listLotsForItem(db, { householdId, itemId, inStockOnly: false });
    const qtyByLocation = new Map(lots.map((lot) => [lot.locationId, lot.quantity]));
    const candidates: LocationCandidate[] = (resolved.candidates ?? []).map((candidate) => ({
      locationId: candidate.locationId,
      pathLabel: candidate.pathLabel,
      quantity: qtyByLocation.get(candidate.locationId) ?? 0,
    }));
    return {
      type: "clarification",
      spoken: resolved.spoken,
      clarification: { type: "which_location", candidates },
    };
  }
  return { type: "error", code: "unknown_location", spoken: resolved.spoken };
}

function rankUsual(lots: LotListRow[]): LotListRow | undefined {
  if (lots.length === 0) return undefined;
  return [...lots].sort((a, b) => {
    if (b.putAwayCount !== a.putAwayCount) return b.putAwayCount - a.putAwayCount;
    return b.lastActivityAt.getTime() - a.lastActivityAt.getTime();
  })[0];
}

function toSnapshots(lots: LotListRow[]): LotSnapshot[] {
  return lots.map((lot) => ({
    locationId: lot.locationId,
    pathLabel: lot.pathLabel,
    quantity: lot.quantity,
  }));
}

async function snapshots(db: Database, householdId: string, itemId: string): Promise<LotSnapshot[]> {
  return toSnapshots(await listLotsForItem(db, { householdId, itemId, inStockOnly: false }));
}

function unknownLocation(segment: string): CommandOutcome {
  return { type: "error", code: "unknown_location", spoken: `I don't have a place called ${segment}.` };
}

function lotQuantityError(quantity: number): CommandOutcome | undefined {
  if (quantity <= 0) {
    return { type: "error", code: "not_caught", spoken: "I didn't catch that." };
  }
  return undefined;
}

function mapLotWriteError(
  error: unknown,
  context: { segment?: string; itemText?: string },
): CommandOutcome {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "quantity must be positive") {
    return { type: "error", code: "not_caught", spoken: "I didn't catch that." };
  }
  if (message === "location is archived" || message === "location does not belong to household") {
    return unknownLocation(context.segment ?? "that place");
  }
  if (message === "item does not belong to household") {
    return {
      type: "error",
      code: "unknown_item",
      spoken: `I don't have ${context.itemText ?? "that"} yet.`,
    };
  }
  throw error;
}
