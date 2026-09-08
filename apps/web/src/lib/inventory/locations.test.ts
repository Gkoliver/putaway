import { describe, expect, it } from "vitest";
import { withTestDb } from "../db/test";
import { createHousehold } from "../households";
import { pathLabelFor, resolveLocationPath } from "./locations";

describe("resolveLocationPath", () => {
  it("creates Basement → Metal shelves → Shelf A on put-away", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      const created = await resolveLocationPath(db, {
        householdId,
        segments: ["basement", "metal shelves", "shelf a"],
        create: true,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(await pathLabelFor(db, created.locationId)).toBe(
        "Basement → Metal shelves → Shelf A",
      );
    });
  });

  it("reuses a fuzzy sibling instead of duplicating", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      const first = await resolveLocationPath(db, {
        householdId,
        segments: ["basement", "metal shelves"],
        create: true,
      });
      const second = await resolveLocationPath(db, {
        householdId,
        segments: ["basement", "metal shelf"],
        create: true,
      });
      expect(first.ok && second.ok).toBe(true);
      if (first.ok && second.ok) expect(second.locationId).toBe(first.locationId);
    });
  });

  it("does not create on find/take-out", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      const result = await resolveLocationPath(db, {
        householdId,
        segments: ["attic"],
        create: false,
      });
      expect(result).toMatchObject({ ok: false, code: "unknown_location" });
    });
  });
});
