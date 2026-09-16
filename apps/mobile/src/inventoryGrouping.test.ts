import { describe, expect, it } from "vitest";
import { filterInventory, groupInventoryByLocation } from "./inventoryGrouping";
import type { InventoryRow } from "./api";

function row(partial: Partial<InventoryRow> & Pick<InventoryRow, "itemName" | "pathLabel">): InventoryRow {
  return {
    itemId: partial.itemId ?? partial.itemName,
    locationId: partial.locationId ?? partial.pathLabel,
    quantity: partial.quantity ?? 1,
    itemName: partial.itemName,
    pathLabel: partial.pathLabel,
  };
}

describe("groupInventoryByLocation", () => {
  it("returns no sections for an empty list", () => {
    expect(groupInventoryByLocation([])).toEqual([]);
  });

  it("groups items under the same location and sorts locations by path", () => {
    const grouped = groupInventoryByLocation([
      row({ itemName: "Hats", pathLabel: "Right foyer cabinet", quantity: 8 }),
      row({ itemName: "Dishwasher detergent", pathLabel: "Basement cabinet" }),
      row({ itemName: "Paper towels", pathLabel: "Basement cabinet", quantity: 2 }),
    ]);

    expect(grouped.map((section) => section.pathLabel)).toEqual([
      "Basement cabinet",
      "Right foyer cabinet",
    ]);
    expect(grouped[0].rows.map((item) => item.itemName)).toEqual([
      "Dishwasher detergent",
      "Paper towels",
    ]);
    expect(grouped[1].rows.map((item) => item.itemName)).toEqual(["Hats"]);
    expect(grouped[1].rows[0].quantity).toBe(8);
  });

  it("keeps distinct location ids with the same path label separate", () => {
    const grouped = groupInventoryByLocation([
      row({
        itemId: "a",
        itemName: "Tape",
        locationId: "loc-1",
        pathLabel: "Garage",
      }),
      row({
        itemId: "b",
        itemName: "Nails",
        locationId: "loc-2",
        pathLabel: "Garage",
      }),
    ]);

    expect(grouped).toHaveLength(2);
    expect(grouped.map((section) => section.locationId)).toEqual(["loc-1", "loc-2"]);
  });
});

describe("filterInventory", () => {
  const rows = [
    row({ itemName: "Paper towels", pathLabel: "Basement → Shelves" }),
    row({ itemName: "Toilet paper", pathLabel: "Basement → Shelves" }),
    row({ itemName: "Hats", pathLabel: "Foyer → Closet" }),
  ];

  it("returns all rows when the query is blank", () => {
    expect(filterInventory(rows, "")).toHaveLength(3);
    expect(filterInventory(rows, "   ")).toHaveLength(3);
  });

  it("matches item names case-insensitively", () => {
    expect(filterInventory(rows, "paper").map((r) => r.itemName)).toEqual([
      "Paper towels",
      "Toilet paper",
    ]);
  });

  it("matches location path segments", () => {
    expect(filterInventory(rows, "foyer").map((r) => r.itemName)).toEqual(["Hats"]);
  });
});
