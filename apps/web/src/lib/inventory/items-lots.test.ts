import { describe, expect, it } from "vitest";
import { withTestDb } from "../db/test";
import { createHousehold } from "../households";
import { resolveItem } from "./items";
import { decrementLot, incrementLot, listLotsForItem } from "./lots";
import { resolveLocationPath } from "./locations";

describe("items and lots", () => {
  it("creates on put-away and decrements to zero without deleting", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      const item = await resolveItem(db, { householdId, itemText: "paper towels", create: true });
      expect(item.ok).toBe(true);
      if (!item.ok) return;
      const loc = await resolveLocationPath(db, {
        householdId,
        segments: ["basement"],
        create: true,
      });
      if (!loc.ok) throw new Error("loc");
      const afterAdd = await incrementLot(db, {
        householdId,
        itemId: item.itemId,
        locationId: loc.locationId,
        quantity: 2,
        at: new Date("2026-09-07T12:00:00Z"),
      });
      expect(afterAdd).toMatchObject({ quantity: 2, putAwayCount: 1 });
      const afterTake = await decrementLot(db, {
        householdId,
        itemId: item.itemId,
        locationId: loc.locationId,
        quantity: 5,
        at: new Date("2026-09-07T13:00:00Z"),
      });
      expect(afterTake).toEqual({ quantity: 0, requested: 5, clamped: true });
      const lots = await listLotsForItem(db, { householdId, itemId: item.itemId, inStockOnly: false });
      expect(lots).toHaveLength(1);
      expect(lots[0].quantity).toBe(0);
    });
  });

  it("does not create items on find", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      const result = await resolveItem(db, { householdId, itemText: "paper towels", create: false });
      expect(result).toMatchObject({ ok: false, code: "unknown_item" });
    });
  });
});
