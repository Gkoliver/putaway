import { describe, expect, it } from "vitest";
import { withTestDb } from "../../../lib/db/test";
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
