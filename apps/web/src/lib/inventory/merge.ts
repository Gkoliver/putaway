import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../db/client";
import { items, locations, stockLots } from "../db/schema";
import { requireMembership } from "../households";

export type MergeInput = {
  userId: string;
  householdId: string;
  sourceLocationId: string;
  targetLocationId: string;
};

export type MergeLotPreview = {
  itemName: string;
  sourceQty: number;
  targetQty: number;
  mergedQty: number;
};

export type MergeFail = {
  ok: false;
  code: "invalid_merge" | "forbidden";
  spoken: string;
};

export type PreviewMergeResult = { ok: true; lots: MergeLotPreview[] } | MergeFail;
export type ApplyMergeResult = { ok: true } | MergeFail;

function forbidden(): MergeFail {
  return { ok: false, code: "forbidden", spoken: "You don't have access to that household." };
}

function invalidMerge(): MergeFail {
  return { ok: false, code: "invalid_merge", spoken: "Those places can't be merged." };
}

async function requireOwner(
  db: Database,
  userId: string,
  householdId: string,
): Promise<MergeFail | null> {
  const membership = await requireMembership(db, userId, householdId);
  if (!membership || membership.role !== "owner") return forbidden();
  return null;
}

async function loadPair(
  db: Database,
  householdId: string,
  sourceLocationId: string,
  targetLocationId: string,
  options?: { lock?: boolean },
) {
  if (sourceLocationId === targetLocationId) return { error: invalidMerge() };

  const query = db
    .select()
    .from(locations)
    .where(inArray(locations.id, [sourceLocationId, targetLocationId]));
  const rows = options?.lock ? await query.for("update") : await query;
  const source = rows.find((row) => row.id === sourceLocationId);
  const target = rows.find((row) => row.id === targetLocationId);

  if (!source || !target) return { error: invalidMerge() };
  if (source.householdId !== householdId || target.householdId !== householdId) {
    return { error: invalidMerge() };
  }
  if (source.archivedAt || target.archivedAt) return { error: invalidMerge() };
  return { source, target };
}

async function previewLots(
  db: Database,
  sourceLocationId: string,
  targetLocationId: string,
): Promise<MergeLotPreview[]> {
  const sourceLots = await db
    .select({
      itemId: stockLots.itemId,
      quantity: stockLots.quantity,
      itemName: items.name,
    })
    .from(stockLots)
    .innerJoin(items, eq(items.id, stockLots.itemId))
    .where(eq(stockLots.locationId, sourceLocationId));

  const targetLots = await db
    .select({ itemId: stockLots.itemId, quantity: stockLots.quantity })
    .from(stockLots)
    .where(eq(stockLots.locationId, targetLocationId));
  const targetQtyByItem = new Map(targetLots.map((lot) => [lot.itemId, lot.quantity]));

  return sourceLots.map((lot) => {
    const targetQty = targetQtyByItem.get(lot.itemId) ?? 0;
    return {
      itemName: lot.itemName,
      sourceQty: lot.quantity,
      targetQty,
      mergedQty: lot.quantity + targetQty,
    };
  });
}

export async function previewMerge(
  db: Database,
  input: MergeInput,
): Promise<PreviewMergeResult> {
  const auth = await requireOwner(db, input.userId, input.householdId);
  if (auth) return auth;

  const pair = await loadPair(db, input.householdId, input.sourceLocationId, input.targetLocationId);
  if ("error" in pair) return pair.error;

  return {
    ok: true,
    lots: await previewLots(db, pair.source.id, pair.target.id),
  };
}

export async function applyMerge(db: Database, input: MergeInput): Promise<ApplyMergeResult> {
  const auth = await requireOwner(db, input.userId, input.householdId);
  if (auth) return auth;

  return db.transaction(async (tx) => {
    const pair = await loadPair(
      tx as unknown as Database,
      input.householdId,
      input.sourceLocationId,
      input.targetLocationId,
      { lock: true },
    );
    if ("error" in pair) return pair.error;

    const { source, target } = pair;
    const sourceLots = await tx
      .select()
      .from(stockLots)
      .where(eq(stockLots.locationId, source.id))
      .for("update");

    for (const sourceLot of sourceLots) {
      const [targetLot] = await tx
        .select()
        .from(stockLots)
        .where(and(eq(stockLots.locationId, target.id), eq(stockLots.itemId, sourceLot.itemId)))
        .for("update")
        .limit(1);

      if (targetLot) {
        const lastActivityAt =
          sourceLot.lastActivityAt > targetLot.lastActivityAt
            ? sourceLot.lastActivityAt
            : targetLot.lastActivityAt;
        await tx
          .update(stockLots)
          .set({
            quantity: targetLot.quantity + sourceLot.quantity,
            putAwayCount: Math.max(targetLot.putAwayCount, sourceLot.putAwayCount),
            lastActivityAt,
          })
          .where(eq(stockLots.id, targetLot.id));
        await tx.delete(stockLots).where(eq(stockLots.id, sourceLot.id));
      } else {
        await tx.update(stockLots).set({ locationId: target.id }).where(eq(stockLots.id, sourceLot.id));
      }
    }

    await tx.update(locations).set({ archivedAt: new Date() }).where(eq(locations.id, source.id));
    return { ok: true };
  });
}
