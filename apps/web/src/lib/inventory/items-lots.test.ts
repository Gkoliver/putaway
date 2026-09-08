import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "../db/test";
import { locations, stockLots } from "../db/schema";
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

  it("rejects increment and decrement with cross-household ids", async () => {
    await withTestDb(async (db) => {
      const a = await createHousehold(db, { userId: "u1", name: "A" });
      const b = await createHousehold(db, { userId: "u2", name: "B" });
      const itemB = await resolveItem(db, {
        householdId: b.householdId,
        itemText: "paper towels",
        create: true,
      });
      expect(itemB.ok).toBe(true);
      if (!itemB.ok) return;
      const locB = await resolveLocationPath(db, {
        householdId: b.householdId,
        segments: ["basement"],
        create: true,
      });
      if (!locB.ok) throw new Error("loc");

      await expect(
        incrementLot(db, {
          householdId: a.householdId,
          itemId: itemB.itemId,
          locationId: locB.locationId,
          quantity: 1,
          at: new Date("2026-09-07T12:00:00Z"),
        }),
      ).rejects.toThrow();

      await expect(
        decrementLot(db, {
          householdId: a.householdId,
          itemId: itemB.itemId,
          locationId: locB.locationId,
          quantity: 1,
          at: new Date("2026-09-07T13:00:00Z"),
        }),
      ).rejects.toThrow();

      const mixed = await db.select().from(stockLots);
      expect(mixed).toHaveLength(0);
    });
  });

  it("second increment upserts quantity and putAwayCount", async () => {
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
      await incrementLot(db, {
        householdId,
        itemId: item.itemId,
        locationId: loc.locationId,
        quantity: 2,
        at: new Date("2026-09-07T12:00:00Z"),
      });
      const second = await incrementLot(db, {
        householdId,
        itemId: item.itemId,
        locationId: loc.locationId,
        quantity: 3,
        at: new Date("2026-09-07T13:00:00Z"),
      });
      expect(second).toMatchObject({ quantity: 5, putAwayCount: 2 });
    });
  });

  it("drops archived locations from listLotsForItem", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      const item = await resolveItem(db, { householdId, itemText: "paper towels", create: true });
      expect(item.ok).toBe(true);
      if (!item.ok) return;
      const basement = await resolveLocationPath(db, {
        householdId,
        segments: ["basement"],
        create: true,
      });
      const attic = await resolveLocationPath(db, {
        householdId,
        segments: ["attic"],
        create: true,
      });
      if (!basement.ok || !attic.ok) throw new Error("loc");
      await incrementLot(db, {
        householdId,
        itemId: item.itemId,
        locationId: basement.locationId,
        quantity: 1,
        at: new Date("2026-09-07T12:00:00Z"),
      });
      await incrementLot(db, {
        householdId,
        itemId: item.itemId,
        locationId: attic.locationId,
        quantity: 1,
        at: new Date("2026-09-07T12:00:00Z"),
      });
      await db
        .update(locations)
        .set({ archivedAt: new Date() })
        .where(eq(locations.id, attic.locationId));
      const lots = await listLotsForItem(db, {
        householdId,
        itemId: item.itemId,
        inStockOnly: false,
      });
      expect(lots).toHaveLength(1);
      expect(lots[0].locationId).toBe(basement.locationId);
    });
  });

  it("hides zeros when inStockOnly is true", async () => {
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
      await incrementLot(db, {
        householdId,
        itemId: item.itemId,
        locationId: loc.locationId,
        quantity: 1,
        at: new Date("2026-09-07T12:00:00Z"),
      });
      await decrementLot(db, {
        householdId,
        itemId: item.itemId,
        locationId: loc.locationId,
        quantity: 1,
        at: new Date("2026-09-07T13:00:00Z"),
      });
      const inStock = await listLotsForItem(db, {
        householdId,
        itemId: item.itemId,
        inStockOnly: true,
      });
      expect(inStock).toHaveLength(0);
      const all = await listLotsForItem(db, {
        householdId,
        itemId: item.itemId,
        inStockOnly: false,
      });
      expect(all).toHaveLength(1);
      expect(all[0].quantity).toBe(0);
    });
  });

  it("rejects non-positive increment and decrement quantities", async () => {
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
      await incrementLot(db, {
        householdId,
        itemId: item.itemId,
        locationId: loc.locationId,
        quantity: 2,
        at: new Date("2026-09-07T12:00:00Z"),
      });

      await expect(
        incrementLot(db, {
          householdId,
          itemId: item.itemId,
          locationId: loc.locationId,
          quantity: 0,
          at: new Date("2026-09-07T13:00:00Z"),
        }),
      ).rejects.toThrow();
      await expect(
        incrementLot(db, {
          householdId,
          itemId: item.itemId,
          locationId: loc.locationId,
          quantity: -1,
          at: new Date("2026-09-07T13:00:00Z"),
        }),
      ).rejects.toThrow();
      await expect(
        decrementLot(db, {
          householdId,
          itemId: item.itemId,
          locationId: loc.locationId,
          quantity: 0,
          at: new Date("2026-09-07T13:00:00Z"),
        }),
      ).rejects.toThrow();
      await expect(
        decrementLot(db, {
          householdId,
          itemId: item.itemId,
          locationId: loc.locationId,
          quantity: -3,
          at: new Date("2026-09-07T13:00:00Z"),
        }),
      ).rejects.toThrow();

      const lots = await listLotsForItem(db, { householdId, itemId: item.itemId, inStockOnly: false });
      expect(lots).toHaveLength(1);
      expect(lots[0]).toMatchObject({ quantity: 2, putAwayCount: 1 });
    });
  });

  it("rejects increment and decrement on an archived location", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      const item = await resolveItem(db, { householdId, itemText: "paper towels", create: true });
      expect(item.ok).toBe(true);
      if (!item.ok) return;
      const loc = await resolveLocationPath(db, {
        householdId,
        segments: ["attic"],
        create: true,
      });
      if (!loc.ok) throw new Error("loc");
      await incrementLot(db, {
        householdId,
        itemId: item.itemId,
        locationId: loc.locationId,
        quantity: 2,
        at: new Date("2026-09-07T12:00:00Z"),
      });
      await db
        .update(locations)
        .set({ archivedAt: new Date() })
        .where(eq(locations.id, loc.locationId));

      await expect(
        incrementLot(db, {
          householdId,
          itemId: item.itemId,
          locationId: loc.locationId,
          quantity: 1,
          at: new Date("2026-09-07T13:00:00Z"),
        }),
      ).rejects.toThrow();
      await expect(
        decrementLot(db, {
          householdId,
          itemId: item.itemId,
          locationId: loc.locationId,
          quantity: 1,
          at: new Date("2026-09-07T14:00:00Z"),
        }),
      ).rejects.toThrow();

      const [lot] = await db.select().from(stockLots);
      expect(lot).toMatchObject({ quantity: 2, putAwayCount: 1 });
    });
  });

  it("does not include another household's node names in path labels", async () => {
    await withTestDb(async (db) => {
      const a = await createHousehold(db, { userId: "u1", name: "A" });
      const b = await createHousehold(db, { userId: "u2", name: "B" });
      const secret = await resolveLocationPath(db, {
        householdId: a.householdId,
        segments: ["secret vault"],
        create: true,
      });
      if (!secret.ok) throw new Error("loc");
      const pantry = await resolveLocationPath(db, {
        householdId: b.householdId,
        segments: ["pantry"],
        create: true,
      });
      if (!pantry.ok) throw new Error("loc");
      await db
        .update(locations)
        .set({ parentId: secret.locationId })
        .where(eq(locations.id, pantry.locationId));

      const item = await resolveItem(db, {
        householdId: b.householdId,
        itemText: "paper towels",
        create: true,
      });
      expect(item.ok).toBe(true);
      if (!item.ok) return;
      await incrementLot(db, {
        householdId: b.householdId,
        itemId: item.itemId,
        locationId: pantry.locationId,
        quantity: 1,
        at: new Date("2026-09-07T12:00:00Z"),
      });

      const lots = await listLotsForItem(db, {
        householdId: b.householdId,
        itemId: item.itemId,
        inStockOnly: false,
      });
      expect(lots).toHaveLength(1);
      expect(lots[0].pathLabel).toBe("Pantry");
      expect(lots[0].pathLabel).not.toContain("Secret vault");
    });
  });
});
