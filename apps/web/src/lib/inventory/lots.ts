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
  previousQuantity: number;
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

async function requireOwnedItem(
  db: Database,
  householdId: string,
  itemId: string,
): Promise<void> {
  const [item] = await db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.householdId, householdId)))
    .limit(1);
  if (!item) {
    throw new Error("item does not belong to household");
  }
}

async function lockAndRequireActiveLocation(
  tx: Database,
  householdId: string,
  locationId: string,
): Promise<void> {
  const [location] = await tx
    .select({ id: locations.id, archivedAt: locations.archivedAt })
    .from(locations)
    .where(and(eq(locations.id, locationId), eq(locations.householdId, householdId)))
    .for("update")
    .limit(1);
  if (!location) {
    throw new Error("location does not belong to household");
  }
  if (location.archivedAt) {
    throw new Error("location is archived");
  }
}

function requireNonNegativeInteger(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error("quantity must be a non-negative integer");
  }
}

function requirePositiveQuantity(quantity: number): void {
  if (quantity <= 0) {
    throw new Error("quantity must be positive");
  }
}

export async function setLotQuantity(
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
): Promise<{ quantity: number }> {
  requireNonNegativeInteger(quantity);
  await requireOwnedItem(db, householdId, itemId);
  await lockAndRequireActiveLocation(db, householdId, locationId);

  const [existing] = await db
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
    const [row] = await db
      .insert(stockLots)
      .values({
        householdId,
        itemId,
        locationId,
        quantity,
        putAwayCount: quantity > 0 ? 1 : 0,
        lastActivityAt: at,
      })
      .returning();
    return { quantity: row.quantity };
  }

  await db
    .update(stockLots)
    .set({ quantity, lastActivityAt: at })
    .where(eq(stockLots.id, existing.id));
  return { quantity };
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
  await requireOwnedItem(db, householdId, itemId);

  return db.transaction(async (tx) => {
    await lockAndRequireActiveLocation(tx, householdId, locationId);

    const [row] = await tx
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
  });
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
  await requireOwnedItem(db, householdId, itemId);

  return db.transaction(async (tx) => {
    await lockAndRequireActiveLocation(tx, householdId, locationId);

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
      return { quantity: 0, previousQuantity: 0, requested: quantity, clamped: true };
    }

    const previousQuantity = existing.quantity;
    const newQty = Math.max(0, previousQuantity - quantity);
    const clamped = quantity > previousQuantity;
    await tx
      .update(stockLots)
      .set({ quantity: newQty, lastActivityAt: at })
      .where(eq(stockLots.id, existing.id));
    return { quantity: newQty, previousQuantity, requested: quantity, clamped };
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
      pathLabel: await pathLabelFor(db, householdId, row.locationId),
      archived: false,
    })),
  );
}
