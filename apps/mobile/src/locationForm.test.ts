import { describe, expect, it } from "vitest";
import {
  blockedParentIds,
  buildPlaceTree,
  descendantLocationIds,
  flattenPlaceTree,
  inventoryInPlaceSubtree,
  parentOptions,
  validateLocationName,
} from "./locationForm";

describe("validateLocationName", () => {
  it("rejects blank names", () => {
    expect(validateLocationName("")).toBe("Enter a place name.");
    expect(validateLocationName("  ")).toBe("Enter a place name.");
  });

  it("accepts a real name", () => {
    expect(validateLocationName("Basement")).toBeNull();
  });
});

describe("parentOptions", () => {
  const nodes = [
    { id: "a", parentId: null, name: "Basement", pathLabel: "Basement" },
    { id: "b", parentId: "a", name: "Cabinet", pathLabel: "Basement → Cabinet" },
    { id: "c", parentId: null, name: "Attic", pathLabel: "Attic" },
  ];

  it("blocks self and descendants when reparenting", () => {
    expect([...blockedParentIds(nodes, "a")].sort()).toEqual(["a", "b"]);
    expect(parentOptions(nodes, "a").map((option) => option.label)).toEqual([
      "(root)",
      "Attic",
    ]);
  });

  it("allows any parent when creating", () => {
    expect(parentOptions(nodes, null).map((option) => option.id)).toEqual([null, "a", "b", "c"]);
  });
});

describe("buildPlaceTree", () => {
  it("nests children under parents sorted by name", () => {
    const nodes = [
      { id: "a", parentId: null, name: "Basement", pathLabel: "Basement" },
      {
        id: "r",
        parentId: "a",
        name: "Shelves to the right",
        pathLabel: "Basement → Shelves to the right",
      },
      {
        id: "l",
        parentId: "a",
        name: "Shelves to the left",
        pathLabel: "Basement → Shelves to the left",
      },
      { id: "c", parentId: null, name: "Attic", pathLabel: "Attic" },
    ];
    const tree = buildPlaceTree(nodes);
    expect(tree.map((n) => n.name)).toEqual(["Attic", "Basement"]);
    expect(tree[1].children.map((n) => n.name)).toEqual([
      "Shelves to the left",
      "Shelves to the right",
    ]);
    expect(tree[1].hasChildren).toBe(true);
    expect(tree[0].hasChildren).toBe(false);
  });
});

describe("flattenPlaceTree", () => {
  it("hides collapsed children and keeps depth", () => {
    const tree = buildPlaceTree([
      { id: "a", parentId: null, name: "Basement", pathLabel: "Basement" },
      { id: "l", parentId: "a", name: "Left", pathLabel: "Basement → Left" },
      { id: "r", parentId: "a", name: "Right", pathLabel: "Basement → Right" },
    ]);
    expect(
      flattenPlaceTree(tree, new Set()).map((row) => ({
        id: row.id,
        depth: row.depth,
        hasChildren: row.hasChildren,
      })),
    ).toEqual([{ id: "a", depth: 0, hasChildren: true }]);
    expect(
      flattenPlaceTree(tree, new Set(["a"])).map((row) => ({
        id: row.id,
        depth: row.depth,
        name: row.name,
      })),
    ).toEqual([
      { id: "a", depth: 0, name: "Basement" },
      { id: "l", depth: 1, name: "Left" },
      { id: "r", depth: 1, name: "Right" },
    ]);
  });
});

describe("inventoryInPlaceSubtree", () => {
  const nodes = [
    { id: "a", parentId: null, name: "Basement", pathLabel: "Basement" },
    { id: "l", parentId: "a", name: "Left", pathLabel: "Basement → Left" },
    { id: "r", parentId: "a", name: "Right", pathLabel: "Basement → Right" },
    { id: "c", parentId: null, name: "Attic", pathLabel: "Attic" },
  ];

  const inventory = [
    {
      itemId: "1",
      itemName: "Tape",
      locationId: "l",
      pathLabel: "Basement → Left",
      quantity: 2,
    },
    {
      itemId: "2",
      itemName: "Nails",
      locationId: "r",
      pathLabel: "Basement → Right",
      quantity: 1,
    },
    {
      itemId: "3",
      itemName: "Hats",
      locationId: "c",
      pathLabel: "Attic",
      quantity: 1,
    },
  ];

  it("includes the place and all descendants", () => {
    expect([...descendantLocationIds(nodes, "a")].sort()).toEqual(["a", "l", "r"]);
    expect(
      inventoryInPlaceSubtree(inventory, nodes, "a").map((row) => row.itemName).sort(),
    ).toEqual(["Nails", "Tape"]);
  });

  it("returns only that leaf when the place has no children", () => {
    expect(inventoryInPlaceSubtree(inventory, nodes, "l").map((row) => row.itemName)).toEqual([
      "Tape",
    ]);
  });
});
