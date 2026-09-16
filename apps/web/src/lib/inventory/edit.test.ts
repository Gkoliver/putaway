import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "../db/test";
import { items, stockLots } from "../db/schema";
import { createHousehold } from "../households";
import { resolveItem } from "./items";
import { incrementLot } from "./lots";
import { resolveLocationPath } from "./locations";
import { editLot } from "./edit";

async function putAway(
  db: Parameters<typeof incrementLot>[0],
  householdId: string,
  itemText: string,
  segments: string[],
  quantity: number,
) {
  const item = await resolveItem(db, { householdId, itemText, create: true });
  if (!item.ok) throw new Error("item");
  const loc = await resolveLocationPath(db, { householdId, segments, create: true });
  if (!loc.ok) throw new Error("loc");
  await incrementLot(db, {
    householdId,
    itemId: item.itemId,
    locationId: loc.locationId,
    quantity,
    at: new Date("2026-09-09T12:00:00Z"),
  });
  return { itemId: item.itemId, locationId: loc.locationId, name: item.name, pathLabel: loc.pathLabel };
}

describe("editLot", () => {
  it("renames the item and sets quantity in place", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      const lot = await putAway(db, householdId, "8 hats", ["right foyer cabinet"], 1);

      const result = await editLot(db, {
        householdId,
        itemId: lot.itemId,
        locationId: lot.locationId,
        name: "hats",
        quantity: 8,
        locationPath: ["right foyer cabinet"],
      });

      expect(result).toMatchObject({
        ok: true,
        itemName: "Hats",
        quantity: 8,
        pathLabel: "Right foyer cabinet",
      });
      const [item] = await db.select().from(items).where(eq(items.id, lot.itemId));
      expect(item.name).toBe("Hats");
    });
  });

  it("rejects a rename that collides with another item", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      await putAway(db, householdId, "hats", ["foyer"], 1);
      const detergent = await putAway(db, householdId, "soap", ["kitchen"], 1);

      const result = await editLot(db, {
        householdId,
        itemId: detergent.itemId,
        locationId: detergent.locationId,
        name: "hats",
        quantity: 1,
        locationPath: ["kitchen"],
      });

      expect(result).toMatchObject({
        ok: false,
        code: "duplicate_name",
      });
    });
  });

  it("moves a lot to a new location and zeros the source", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      const lot = await putAway(db, householdId, "hats", ["foyer"], 8);

      const result = await editLot(db, {
        householdId,
        itemId: lot.itemId,
        locationId: lot.locationId,
        name: "hats",
        quantity: 8,
        locationPath: ["basement", "cabinet"],
      });

      expect(result).toMatchObject({ ok: true, quantity: 8, pathLabel: "Basement → Cabinet" });
      if (!result.ok) return;
      const rows = await db.select().from(stockLots).where(eq(stockLots.itemId, lot.itemId));
      const byId = Object.fromEntries(rows.map((row) => [row.locationId, row.quantity]));
      expect(byId[lot.locationId]).toBe(0);
      expect(byId[result.locationId]).toBe(8);
    });
  });

  it("adds to an existing destination lot when moving", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      const foyer = await putAway(db, householdId, "hats", ["foyer"], 8);
      const basement = await putAway(db, householdId, "hats", ["basement"], 2);

      const result = await editLot(db, {
        householdId,
        itemId: foyer.itemId,
        locationId: foyer.locationId,
        name: "hats",
        quantity: 8,
        locationPath: ["basement"],
      });

      expect(result).toMatchObject({ ok: true, quantity: 10, pathLabel: "Basement" });
      const rows = await db.select().from(stockLots).where(eq(stockLots.itemId, foyer.itemId));
      const byId = Object.fromEntries(rows.map((row) => [row.locationId, row.quantity]));
      expect(byId[foyer.locationId]).toBe(0);
      expect(byId[basement.locationId]).toBe(10);
    });
  });

  it("sets quantity to zero without deleting the lot", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      const lot = await putAway(db, householdId, "hats", ["foyer"], 8);

      const result = await editLot(db, {
        householdId,
        itemId: lot.itemId,
        locationId: lot.locationId,
        name: "hats",
        quantity: 0,
        locationPath: ["foyer"],
      });

      expect(result).toMatchObject({ ok: true, quantity: 0 });
      const [row] = await db.select().from(stockLots).where(eq(stockLots.itemId, lot.itemId));
      expect(row.quantity).toBe(0);
    });
  });
});
