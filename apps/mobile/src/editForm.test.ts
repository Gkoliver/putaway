import { describe, expect, it } from "vitest";
import { parseLocationPath, validateAddForm, validateEditForm } from "./editForm";

describe("parseLocationPath", () => {
  it("splits an arrow path into segments", () => {
    expect(parseLocationPath("Basement → Cabinet")).toEqual(["Basement", "Cabinet"]);
  });
});

describe("validateEditForm", () => {
  it("rejects an empty name", () => {
    expect(
      validateEditForm({ name: "  ", quantityText: "8", locationLabel: "Foyer" }),
    ).toBe("Type an item name.");
  });

  it("rejects a non-integer quantity", () => {
    expect(
      validateEditForm({ name: "Hats", quantityText: "1.5", locationLabel: "Foyer" }),
    ).toBe("Quantity must be zero or more.");
  });
});

describe("validateAddForm", () => {
  it("requires a place and a positive quantity", () => {
    expect(
      validateAddForm({ name: "Paper towels", quantityText: "2", locationId: null }),
    ).toBe("Pick a place.");
    expect(
      validateAddForm({ name: "Paper towels", quantityText: "0", locationId: "loc-1" }),
    ).toBe("Quantity must be at least 1.");
    expect(
      validateAddForm({ name: "Paper towels", quantityText: "2", locationId: "loc-1" }),
    ).toBeNull();
  });
});
