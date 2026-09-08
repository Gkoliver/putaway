import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "../db/test";
import { locations } from "../db/schema";
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
      expect(await pathLabelFor(db, householdId, created.locationId)).toBe(
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

  it("preserves first-create word casing including acronyms", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      const created = await resolveLocationPath(db, {
        householdId,
        segments: ["TV Closet"],
        create: true,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(created.pathLabel).toBe("TV Closet");
      expect(await pathLabelFor(db, householdId, created.locationId)).toBe("TV Closet");
    });
  });

  it("does not reuse an archived sibling on create", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      const first = await resolveLocationPath(db, {
        householdId,
        segments: ["attic"],
        create: true,
      });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      await db
        .update(locations)
        .set({ archivedAt: new Date() })
        .where(eq(locations.id, first.locationId));
      const second = await resolveLocationPath(db, {
        householdId,
        segments: ["attic"],
        create: true,
      });
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.locationId).not.toBe(first.locationId);
    });
  });

  it("returns ambiguous_location when siblings both match", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      const closet = await resolveLocationPath(db, {
        householdId,
        segments: ["Hall closet"],
        create: true,
      });
      const cabinet = await resolveLocationPath(db, {
        householdId,
        segments: ["Hall cabinet"],
        create: true,
      });
      expect(closet.ok && cabinet.ok).toBe(true);
      if (!closet.ok || !cabinet.ok) return;
      const result = await resolveLocationPath(db, {
        householdId,
        segments: ["hall"],
        create: true,
      });
      expect(result).toMatchObject({ ok: false, code: "ambiguous_location" });
      if (result.ok) return;
      expect(result.candidates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ locationId: closet.locationId }),
          expect.objectContaining({ locationId: cabinet.locationId }),
        ]),
      );
    });
  });

  it("rejects an empty path as unknown_location", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      const result = await resolveLocationPath(db, {
        householdId,
        segments: [],
        create: true,
      });
      expect(result).toMatchObject({ ok: false, code: "unknown_location" });
    });
  });

  it("rejects an empty segment as unknown_location and does not create an unnamed node", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      const result = await resolveLocationPath(db, {
        householdId,
        segments: ["basement", "  ", "shelf a"],
        create: true,
      });
      expect(result).toMatchObject({ ok: false, code: "unknown_location" });
      const rows = await db.select().from(locations);
      expect(rows.every((row) => row.name.trim() !== "")).toBe(true);
    });
  });
});
