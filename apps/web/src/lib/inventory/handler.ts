import { and, eq } from "drizzle-orm";
import type {
  CommandOutcome,
  InventoryCommand,
  ItemCandidate,
  LocationCandidate,
  LotSnapshot,
} from "@putaway/shared";
import type { Database } from "../db/client";
import { items, locations } from "../db/schema";
import { requireMembership } from "../households";
import { resolveItem } from "./items";
import { pathLabelFor, resolveLocationPath } from "./locations";
import { decrementLot, incrementLot, listLotsForItem, type LotListRow } from "./lots";

export async function handleCommand(
  db: Database,
  input: { userId: string; householdId: string; command: InventoryCommand },
): Promise<CommandOutcome> {
  const membership = await requireMembership(db, input.userId, input.householdId);
  if (!membership) {
    return { type: "error", code: "forbidden", spoken: "You don't have access to that household." };
  }

  return db.transaction(async (tx) =>
    applyCommand(tx as unknown as Database, input.householdId, input.command),
  );
}

async function applyCommand(
  db: Database,
  householdId: string,
  command: InventoryCommand,
): Promise<CommandOutcome> {
  const create = command.intent === "put_away";
  const item = await resolveCommandItem(db, householdId, command, create);
  if (item.type !== "resolved") return item;

  const location = await resolveCommandLocation(db, householdId, command, create);
  if (location && location.type !== "resolved") return location;

  const at = new Date();

  if (command.intent === "put_away") {
    if (!location || location.type !== "resolved") {
      return unknownLocation(command.locationPath?.[0] ?? "that place");
    }
    const incremented = await incrementLot(db, {
      householdId,
      itemId: item.itemId,
      locationId: location.locationId,
      quantity: command.quantity,
      at,
    });
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
    command: InventoryCommand;
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
  const before = (await listLotsForItem(db, { householdId, itemId, inStockOnly: false })).find(
    (lot) => lot.locationId === locationId,
  );
  const onHand = before?.quantity ?? 0;
  const decremented = await decrementLot(db, { householdId, itemId, locationId, quantity, at });
  const lots = await snapshots(db, householdId, itemId);
  const spoken = decremented.clamped
    ? `Only ${onHand} left in ${pathLabel}. Marked 0.`
    : `Took ${quantity} ${name} from ${pathLabel}. Now ${decremented.quantity}.`;
  return { type: "ok", spoken, itemId, itemName: name, lots };
}

async function resolveCommandItem(
  db: Database,
  householdId: string,
  command: InventoryCommand,
  create: boolean,
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

  const resolved = await resolveItem(db, { householdId, itemText: command.itemText, create });
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
  command: InventoryCommand,
  create: boolean,
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
    const candidates: LocationCandidate[] = (resolved.candidates ?? []).map((candidate) => ({
      locationId: candidate.locationId,
      pathLabel: candidate.pathLabel,
      quantity: 0,
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
