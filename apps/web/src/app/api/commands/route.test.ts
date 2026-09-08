import { describe, expect, it } from "vitest";
import { withTestDb } from "../../../lib/db/test";
import { createHousehold } from "../../../lib/households";
import { handleCommandsPost } from "./route";

describe("POST /api/commands", () => {
  it("returns 403 when the user is not a member", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "owner", name: "H" });
      const res = await handleCommandsPost(
        new Request("http://localhost/api/commands", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            householdId,
            clientCommandId: "cmd-1",
            command: { intent: "find", itemText: "paper towels", quantity: 1 },
          }),
        }),
        { db, getUserId: async () => "stranger" },
      );
      expect(res.status).toBe(403);
    });
  });

  it("applies a duplicate command_id only once", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "owner", name: "H" });
      const body = {
        householdId,
        clientCommandId: "cmd-dup",
        command: {
          intent: "put_away",
          itemText: "paper towels",
          quantity: 1,
          locationPath: ["basement"],
        },
      };
      const once = () =>
        handleCommandsPost(
          new Request("http://localhost/api/commands", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
          { db, getUserId: async () => "owner" },
        );
      const a = await (await once()).json();
      const b = await (await once()).json();
      expect(a).toEqual(b);
      expect(a.lots[0].quantity).toBe(1);
    });
  });

  it("completes take-out after which_location clarification", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "owner", name: "H" });
      for (const place of ["kitchen", "basement"]) {
        await handleCommandsPost(
          new Request("http://localhost/api/commands", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              householdId,
              clientCommandId: `put-${place}`,
              command: {
                intent: "put_away",
                itemText: "paper towels",
                quantity: 2,
                locationPath: [place],
              },
            }),
          }),
          { db, getUserId: async () => "owner" },
        );
      }
      const ask = await (
        await handleCommandsPost(
          new Request("http://localhost/api/commands", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              householdId,
              clientCommandId: "take-1",
              command: { intent: "take_out", itemText: "paper towels", quantity: 1 },
            }),
          }),
          { db, getUserId: async () => "owner" },
        )
      ).json();
      expect(ask.type).toBe("clarification");
      const locationId = ask.clarification.candidates[0].locationId;
      const done = await (
        await handleCommandsPost(
          new Request("http://localhost/api/commands", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              householdId,
              clientCommandId: "take-2",
              command: {
                intent: "take_out",
                itemText: "paper towels",
                quantity: 1,
                locationId,
              },
            }),
          }),
          { db, getUserId: async () => "owner" },
        )
      ).json();
      expect(done.type).toBe("ok");
      expect(done.spoken).toMatch(/Now /);
    });
  });
});
