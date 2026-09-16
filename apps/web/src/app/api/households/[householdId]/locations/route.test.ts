import { describe, expect, it } from "vitest";
import { withTestDb } from "../../../../../lib/db/test";
import { createHousehold } from "../../../../../lib/households";
import { resolveLocationPath } from "../../../../../lib/inventory/locations";
import {
  handleLocationsGet,
  handleLocationsPatch,
  handleLocationsPost,
} from "./route";

describe("GET /api/households/[householdId]/locations", () => {
  it("returns 401 when signed out", async () => {
    await withTestDb(async (db) => {
      const res = await handleLocationsGet(
        new Request("http://localhost/api/households/h1/locations"),
        "h1",
        { db, getUserId: async () => null },
      );
      expect(res.status).toBe(401);
    });
  });

  it("lists the location tree for a member", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "user-a", name: "H" });
      await resolveLocationPath(db, {
        householdId,
        segments: ["basement", "cabinet"],
        create: true,
      });
      const res = await handleLocationsGet(
        new Request(`http://localhost/api/households/${householdId}/locations`),
        householdId,
        { db, getUserId: async () => "user-a" },
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as { pathLabel: string }[];
      expect(json.map((row) => row.pathLabel)).toEqual(["Basement", "Basement → Cabinet"]);
    });
  });
});

describe("POST /api/households/[householdId]/locations", () => {
  it("creates a root place for the owner", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "user-a", name: "H" });
      const res = await handleLocationsPost(
        new Request(`http://localhost/api/households/${householdId}/locations`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "attic", parentId: null }),
        }),
        householdId,
        { db, getUserId: async () => "user-a" },
      );
      expect(res.status).toBe(201);
      await expect(res.json()).resolves.toMatchObject({
        ok: true,
        pathLabel: "Attic",
      });
    });
  });

  it("returns 403 for non-owners", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "user-a", name: "H" });
      const res = await handleLocationsPost(
        new Request(`http://localhost/api/households/${householdId}/locations`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "attic", parentId: null }),
        }),
        householdId,
        { db, getUserId: async () => "stranger" },
      );
      expect(res.status).toBe(403);
    });
  });
});

describe("PATCH /api/households/[householdId]/locations", () => {
  it("renames and reparents a place", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "user-a", name: "H" });
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
      expect(basement.ok && attic.ok).toBe(true);
      if (!basement.ok || !attic.ok) return;

      const rename = await handleLocationsPatch(
        new Request(`http://localhost/api/households/${householdId}/locations`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ locationId: attic.locationId, name: "Loft" }),
        }),
        householdId,
        { db, getUserId: async () => "user-a" },
      );
      expect(rename.status).toBe(200);

      const move = await handleLocationsPatch(
        new Request(`http://localhost/api/households/${householdId}/locations`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            locationId: attic.locationId,
            parentId: basement.locationId,
          }),
        }),
        householdId,
        { db, getUserId: async () => "user-a" },
      );
      expect(move.status).toBe(200);

      const tree = await handleLocationsGet(
        new Request(`http://localhost/api/households/${householdId}/locations`),
        householdId,
        { db, getUserId: async () => "user-a" },
      );
      const json = (await tree.json()) as { id: string; pathLabel: string }[];
      expect(json.find((row) => row.id === attic.locationId)?.pathLabel).toBe(
        "Basement → Loft",
      );
    });
  });
});
