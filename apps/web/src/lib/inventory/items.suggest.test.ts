import { describe, expect, it, vi } from "vitest";
import { withTestDb } from "../db/test";
import { createHousehold } from "../households";
import { filterSuggestedItems, resolveItem } from "./items";

describe("filterSuggestedItems", () => {
  const catalog = [
    { itemId: "1", name: "Kleenex" },
    { itemId: "2", name: "Paper Towels" },
    { itemId: "3", name: "Trash Bags" },
  ];

  it("keeps only catalog ids in order, dropping unknowns", () => {
    expect(filterSuggestedItems(catalog, ["1", "missing", "3"])).toEqual([
      { itemId: "1", name: "Kleenex" },
      { itemId: "3", name: "Trash Bags" },
    ]);
  });

  it("dedupes repeated ids", () => {
    expect(filterSuggestedItems(catalog, ["1", "1", "2"])).toEqual([
      { itemId: "1", name: "Kleenex" },
      { itemId: "2", name: "Paper Towels" },
    ]);
  });
});

describe("resolveItem suggest-on-miss", () => {
  it("asks which item when string match fails but suggest returns catalog hits", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      await resolveItem(db, { householdId, itemText: "Kleenex", create: true });
      await resolveItem(db, { householdId, itemText: "Paper Towels", create: true });

      const suggest = vi.fn(async (_spoken: string, catalog: { itemId: string; name: string }[]) => {
        const kleenex = catalog.find((row) => row.name === "Kleenex");
        return kleenex ? [kleenex] : [];
      });

      const result = await resolveItem(db, {
        householdId,
        itemText: "facial tissue",
        create: false,
        suggest,
      });

      expect(suggest).toHaveBeenCalledOnce();
      expect(result).toMatchObject({
        ok: false,
        code: "ambiguous_item",
        spoken: "Did you mean Kleenex?",
      });
      if (!result.ok && result.code === "ambiguous_item") {
        expect(result.candidates?.map((c) => c.name)).toEqual(["Kleenex"]);
      }
    });
  });

  it("stays unknown when suggest returns nothing", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      await resolveItem(db, { householdId, itemText: "Kleenex", create: true });

      const result = await resolveItem(db, {
        householdId,
        itemText: "facial tissue",
        create: false,
        suggest: async () => [],
      });

      expect(result).toMatchObject({
        ok: false,
        code: "unknown_item",
        spoken: "I don't have facial tissue yet.",
      });
    });
  });

  it("does not call suggest on put-away create path", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      const suggest = vi.fn(async () => [{ itemId: "x", name: "Nope" }]);
      const result = await resolveItem(db, {
        householdId,
        itemText: "brand new thing",
        create: true,
        suggest,
      });
      expect(suggest).not.toHaveBeenCalled();
      expect(result.ok).toBe(true);
    });
  });
});
