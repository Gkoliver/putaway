import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { items, locations, stockLots } from "../db/schema";
import { pathLabelFor } from "./locations";

export type IncrementLotResult = {
  quantity: number;
  putAwayCount: number;
};

export type DecrementLotResult = {
  quantity: number;
  requested: number;
  clamped: boolean;
};

export type LotListRow = {
  locationId: string;
  quantity: number;
  putAwayCount: number;
  lastActivityAt: Date;
  pathLabel: string;
  archived: boolean;
};

async function requireOwnedItemAndLocation(
  db: Database,
  householdId: string,
  itemId: string,
  locationId: string,
): Promise<void> {
  const [item] = await db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.householdId, householdId)))
    .limit(1);
  if (!item) {
    throw new Error("item does not belong to household");
  }
  const [location] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.id, locationId), eq(locations.householdId, householdId)))
    .limit(1);
  if (!location) {
    throw new Error("location does not belong to household");
  }
}

function requirePositiveQuantity(quantity: number): void {
  if (quantity <= 0) {
    throw new Error("quantity must be positive");
  }
}

export async function incrementLot(
  db: Database,
  {
    householdId,
    itemId,
    locationId,
    quantity,
    at,
  }: {
    householdId: string;
    itemId: string;
    locationId: string;
    quantity: number;
    at: Date;
  },
): Promise<IncrementLotResult> {
  requirePositiveQuantity(quantity);
  await requireOwnedItemAndLocation(db, householdId, itemId, locationId);

  const [row] = await db
    .insert(stockLots)
    .values({
      householdId,
      itemId,
      locationId,
      quantity,
      putAwayCount: 1,
      lastActivityAt: at,
    })
    .onConflictDoUpdate({
      target: [stockLots.householdId, stockLots.itemId, stockLots.locationId],
      set: {
        quantity: sql`${stockLots.quantity} + ${quantity}`,
        putAwayCount: sql`${stockLots.putAwayCount} + 1`,
        lastActivityAt: at,
      },
    })
    .returning();
  return { quantity: row.quantity, putAwayCount: row.putAwayCount };
}

export async function decrementLot(
  db: Database,
  {
    householdId,
    itemId,
    locationId,
    quantity,
    at,
  }: {
    householdId: string;
    itemId: string;
    locationId: string;
    quantity: number;
    at: Date;
  },
): Promise<DecrementLotResult> {
  requirePositiveQuantity(quantity);
  await requireOwnedItemAndLocation(db, householdId, itemId, locationId);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(stockLots)
      .where(
        and(
          eq(stockLots.householdId, householdId),
          eq(stockLots.itemId, itemId),
          eq(stockLots.locationId, locationId),
        ),
      )
      .for("update")
      .limit(1);

    if (!existing) {
      return { quantity: 0, requested: quantity, clamped: true };
    }

    const newQty = Math.max(0, existing.quantity - quantity);
    const clamped = quantity > existing.quantity;
    await tx
      .update(stockLots)
      .set({ quantity: newQty, lastActivityAt: at })
      .where(eq(stockLots.id, existing.id));
    return { quantity: newQty, requested: quantity, clamped };
  });
}

export async function listLotsForItem(
  db: Database,
  {
    householdId,
    itemId,
    inStockOnly,
  }: { householdId: string; itemId: string; inStockOnly: boolean },
): Promise<LotListRow[]> {
  const [item] = await db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.householdId, householdId)))
    .limit(1);
  if (!item) {
    throw new Error("item does not belong to household");
  }

  const rows = await db
    .select({
      locationId: stockLots.locationId,
      quantity: stockLots.quantity,
      putAwayCount: stockLots.putAwayCount,
      lastActivityAt: stockLots.lastActivityAt,
    })
    .from(stockLots)
    .innerJoin(locations, eq(locations.id, stockLots.locationId))
    .where(
      and(
        eq(stockLots.householdId, householdId),
        eq(stockLots.itemId, itemId),
        eq(locations.householdId, householdId),
        isNull(locations.archivedAt),
        inStockOnly ? gt(stockLots.quantity, 0) : undefined,
      ),
    );

  return Promise.all(
    rows.map(async (row) => ({
      locationId: row.locationId,
      quantity: row.quantity,
      putAwayCount: row.putAwayCount,
      lastActivityAt: row.lastActivityAt,
      pathLabel: await pathLabelFor(db, row.locationId),
      archived: false,
    })),
  );
}
