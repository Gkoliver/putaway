import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { locations } from "../db/schema";
import { withTestDb } from "../db/test";
import { createHousehold } from "../households";
import { resolveLocationPath } from "./locations";
import { listLocationTree } from "./queries";

describe("listLocationTree", () => {
  it("omits archived locations and any node with an archived ancestor", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      const basement = await resolveLocationPath(db, {
        householdId,
        segments: ["basement"],
        create: true,
      });
      const shelf = await resolveLocationPath(db, {
        householdId,
        segments: ["basement", "shelf a"],
        create: true,
      });
      const garage = await resolveLocationPath(db, {
        householdId,
        segments: ["garage"],
        create: true,
      });
      expect(basement.ok && shelf.ok && garage.ok).toBe(true);
      if (!basement.ok || !shelf.ok || !garage.ok) return;

      await db
        .update(locations)
        .set({ archivedAt: new Date() })
        .where(eq(locations.id, basement.locationId));

      const tree = await listLocationTree(db, householdId);
      expect(tree.map((node) => node.id)).toEqual([garage.locationId]);
      expect(tree.map((node) => node.pathLabel)).toEqual(["Garage"]);
    });
  });

  it("does not include archived ancestor names in path labels", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      const kitchen = await resolveLocationPath(db, {
        householdId,
        segments: ["kitchen"],
        create: true,
      });
      const drawer = await resolveLocationPath(db, {
        householdId,
        segments: ["kitchen", "drawer"],
        create: true,
      });
      expect(kitchen.ok && drawer.ok).toBe(true);
      if (!kitchen.ok || !drawer.ok) return;

      const live = await listLocationTree(db, householdId);
      expect(live.find((node) => node.id === drawer.locationId)?.pathLabel).toBe(
        "Kitchen → Drawer",
      );

      await db
        .update(locations)
        .set({ archivedAt: new Date() })
        .where(eq(locations.id, kitchen.locationId));

      const afterArchive = await listLocationTree(db, householdId);
      expect(afterArchive.map((node) => node.pathLabel).join(" ")).not.toMatch(/Kitchen/);
    });
  });
});
