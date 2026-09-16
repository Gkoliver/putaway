import { describe, expect, it } from "vitest";
import { withTestDb } from "../../../lib/db/test";
import { acceptInvite, createHousehold, createInvite } from "../../../lib/households";
import { handleInventoryGet, handleInventoryPatch } from "./[householdId]/inventory/route";
import { incrementLot } from "../../../lib/inventory/lots";
import { resolveItem } from "../../../lib/inventory/items";
import { resolveLocationPath } from "../../../lib/inventory/locations";
import { handleInvitesPost } from "./invites/route";
import { handleHouseholdsPost } from "./route";

describe("POST /api/households", () => {
  it("creates a household for the signed-in user", async () => {
    await withTestDb(async (db) => {
      const res = await handleHouseholdsPost(
        new Request("http://localhost/api/households", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Oliver house" }),
        }),
        { db, getUserId: async () => "user-a" },
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.role).toBe("owner");
      expect(json.householdId).toBeTruthy();
    });
  });

  it("returns 401 when signed out", async () => {
    await withTestDb(async (db) => {
      const res = await handleHouseholdsPost(
        new Request("http://localhost/api/households", {
          method: "POST",
          body: JSON.stringify({ name: "X" }),
        }),
        { db, getUserId: async () => null },
      );
      expect(res.status).toBe(401);
    });
  });
});

describe("GET /api/households/[householdId]/inventory", () => {
  it("returns 401 when signed out", async () => {
    await withTestDb(async (db) => {
      const res = await handleInventoryGet(
        new Request("http://localhost/api/households/h1/inventory"),
        "h1",
        { db, getUserId: async () => null },
      );
      expect(res.status).toBe(401);
    });
  });

  it("returns 403 when the user is not a member", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "user-a", name: "Oliver house" });
      const res = await handleInventoryGet(
        new Request(`http://localhost/api/households/${householdId}/inventory`),
        householdId,
        { db, getUserId: async () => "stranger" },
      );
      expect(res.status).toBe(403);
    });
  });

  it("lists inventory for a member", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "user-a", name: "Oliver house" });
      const res = await handleInventoryGet(
        new Request(`http://localhost/api/households/${householdId}/inventory`),
        householdId,
        { db, getUserId: async () => "user-a" },
      );
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual([]);
    });
  });
});

describe("PATCH /api/households/[householdId]/inventory", () => {
  it("returns 401 when signed out", async () => {
    await withTestDb(async (db) => {
      const res = await handleInventoryPatch(
        new Request("http://localhost/api/households/h1/inventory", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        }),
        "h1",
        { db, getUserId: async () => null },
      );
      expect(res.status).toBe(401);
    });
  });

  it("updates a lot for a member", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "user-a", name: "Oliver house" });
      const item = await resolveItem(db, { householdId, itemText: "8 hats", create: true });
      if (!item.ok) throw new Error("item");
      const loc = await resolveLocationPath(db, {
        householdId,
        segments: ["foyer"],
        create: true,
      });
      if (!loc.ok) throw new Error("loc");
      await incrementLot(db, {
        householdId,
        itemId: item.itemId,
        locationId: loc.locationId,
        quantity: 1,
        at: new Date("2026-09-09T12:00:00Z"),
      });

      const res = await handleInventoryPatch(
        new Request(`http://localhost/api/households/${householdId}/inventory`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            itemId: item.itemId,
            locationId: loc.locationId,
            name: "hats",
            quantity: 8,
            locationPath: ["foyer"],
          }),
        }),
        householdId,
        { db, getUserId: async () => "user-a" },
      );
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        ok: true,
        itemName: "Hats",
        quantity: 8,
      });
    });
  });
});

describe("POST /api/households/invites", () => {
  it("returns 403 when a non-owner creates an invite", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "user-a", name: "Oliver house" });
      const { token } = await createInvite(db, {
        householdId,
        email: "brother@example.com",
        role: "member",
        createdByUserId: "user-a",
      });
      await acceptInvite(db, { token, userId: "user-b", email: "brother@example.com" });

      const res = await handleInvitesPost(
        new Request("http://localhost/api/households/invites", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            householdId,
            email: "cousin@example.com",
            role: "member",
          }),
        }),
        { db, getUserId: async () => "user-b" },
      );
      expect(res.status).toBe(403);
    });
  });

  it("returns 400 when role is not owner or member", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "user-a", name: "Oliver house" });
      const res = await handleInvitesPost(
        new Request("http://localhost/api/households/invites", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            householdId,
            email: "guest@example.com",
            role: "admin",
          }),
        }),
        { db, getUserId: async () => "user-a" },
      );
      expect(res.status).toBe(400);
    });
  });
});
