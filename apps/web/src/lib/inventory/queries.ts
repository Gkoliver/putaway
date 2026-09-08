import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import { items, locations, stockLots } from "../db/schema";
import { pathLabelFor } from "./locations";

export type InventoryRow = {
  itemId: string;
  itemName: string;
  locationId: string;
  pathLabel: string;
  quantity: number;
};

export type LocationTreeNode = {
  id: string;
  parentId: string | null;
  name: string;
  pathLabel: string;
};

export async function listInventory(db: Database, householdId: string): Promise<InventoryRow[]> {
  const rows = await db
    .select({
      itemId: items.id,
      itemName: items.name,
      locationId: stockLots.locationId,
      quantity: stockLots.quantity,
    })
    .from(stockLots)
    .innerJoin(items, eq(items.id, stockLots.itemId))
    .innerJoin(locations, eq(locations.id, stockLots.locationId))
    .where(
      and(
        eq(stockLots.householdId, householdId),
        eq(items.householdId, householdId),
        eq(locations.householdId, householdId),
        isNull(locations.archivedAt),
      ),
    );

  const labeled = await Promise.all(
    rows.map(async (row) => ({
      itemId: row.itemId,
      itemName: row.itemName,
      locationId: row.locationId,
      quantity: row.quantity,
      pathLabel: await pathLabelFor(db, householdId, row.locationId),
    })),
  );
  return labeled.sort((a, b) => {
    const byItem = a.itemName.localeCompare(b.itemName);
    if (byItem !== 0) return byItem;
    return a.pathLabel.localeCompare(b.pathLabel);
  });
}

export async function listLocationTree(
  db: Database,
  householdId: string,
): Promise<LocationTreeNode[]> {
  const rows = await db
    .select({
      id: locations.id,
      parentId: locations.parentId,
      name: locations.name,
      archivedAt: locations.archivedAt,
    })
    .from(locations)
    .where(eq(locations.householdId, householdId));

  const byId = new Map(rows.map((row) => [row.id, row]));

  function hasArchivedAncestor(id: string): boolean {
    let current = byId.get(id);
    while (current) {
      if (current.archivedAt) return true;
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return false;
  }

  const visible = rows.filter((row) => !hasArchivedAncestor(row.id));
  const labeled = await Promise.all(
    visible.map(async (row) => ({
      id: row.id,
      parentId: row.parentId,
      name: row.name,
      pathLabel: await pathLabelFor(db, householdId, row.id),
    })),
  );
  return labeled.sort((a, b) => a.pathLabel.localeCompare(b.pathLabel));
}
