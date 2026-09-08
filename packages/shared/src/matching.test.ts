import { describe, expect, it } from "vitest";
import { bestMatches, namesMatch, normalizeName } from "./matching";

describe("normalizeName", () => {
  it("lowercases, strips leading the, collapses space", () => {
    expect(normalizeName("  The Paper Towels ")).toBe("paper towels");
  });
});

describe("namesMatch", () => {
  it("matches exact ignoring case", () => {
    expect(namesMatch("Paper towels", "paper towels")).toBe(true);
  });

  it("matches simple singular/plural", () => {
    expect(namesMatch("paper towel", "paper towels")).toBe(true);
    expect(namesMatch("metal shelves", "metal shelf")).toBe(true);
  });

  it("does not match unrelated names", () => {
    expect(namesMatch("paper towels", "bath towels")).toBe(false);
  });
});

describe("bestMatches", () => {
  const items = [
    { id: "1", name: "Paper towels" },
    { id: "2", name: "Bath towels" },
  ];

  it("returns the unique close match", () => {
    expect(bestMatches("paper towel", items, (i) => i.name).map((i) => i.id)).toEqual([
      "1",
    ]);
  });

  it("returns multiple when the query is ambiguous", () => {
    const got = bestMatches("towels", items, (i) => i.name);
    expect(got.map((i) => i.id).sort()).toEqual(["1", "2"]);
  });

  it("returns empty when nothing is close", () => {
    expect(bestMatches("chainsaw", items, (i) => i.name)).toEqual([]);
  });
});
