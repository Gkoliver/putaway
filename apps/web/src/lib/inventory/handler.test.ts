import { describe, expect, it } from "vitest";
import { withTestDb } from "../db/test";
import { items, locations } from "../db/schema";
import { createHousehold } from "../households";
import { handleCommand } from "./handler";
import type { InventoryCommand } from "@putaway/shared";

const putAway = (overrides: Partial<InventoryCommand> = {}): InventoryCommand => ({
  intent: "put_away",
  itemText: "paper towels",
  quantity: 1,
  locationPath: ["basement"],
  ...overrides,
});

describe("handleCommand", () => {
  it("puts away twice and increments", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      const first = await handleCommand(db, { userId: "u1", householdId, command: putAway() });
      const second = await handleCommand(db, {
        userId: "u1",
        householdId,
        command: putAway({ quantity: 2 }),
      });
      expect(first.type).toBe("ok");
      expect(second.type).toBe("ok");
      if (second.type === "ok") {
        expect(second.spoken).toContain("Now 3");
        expect(second.lots[0].quantity).toBe(3);
      }
    });
  });

  it("asks which location when take-out is ambiguous", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      await handleCommand(db, {
        userId: "u1",
        householdId,
        command: putAway({ locationPath: ["kitchen"], quantity: 4 }),
      });
      await handleCommand(db, {
        userId: "u1",
        householdId,
        command: putAway({ locationPath: ["basement"], quantity: 8 }),
      });
      const asked = await handleCommand(db, {
        userId: "u1",
        householdId,
        command: { intent: "take_out", itemText: "paper towels", quantity: 2 },
      });
      expect(asked.type).toBe("clarification");
      if (asked.type === "clarification") {
        expect(asked.clarification.type).toBe("which_location");
        expect(asked.clarification.type === "which_location" && asked.clarification.candidates).toHaveLength(2);
      }
    });
  });

  it("keeps a zero lot and find falls back to usual place", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      await handleCommand(db, { userId: "u1", householdId, command: putAway({ quantity: 1 }) });
      const loc = await handleCommand(db, {
        userId: "u1",
        householdId,
        command: { intent: "take_out", itemText: "paper towels", quantity: 1, locationPath: ["basement"] },
      });
      expect(loc.type).toBe("ok");
      const find = await handleCommand(db, {
        userId: "u1",
        householdId,
        command: { intent: "find", itemText: "paper towels", quantity: 1 },
      });
      expect(find.type).toBe("ok");
      if (find.type === "ok") expect(find.spoken).toMatch(/You're out/i);
    });
  });

  it("ranks find_usual by put_away_count", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      await handleCommand(db, {
        userId: "u1",
        householdId,
        command: putAway({ locationPath: ["kitchen"], quantity: 1 }),
      });
      await handleCommand(db, {
        userId: "u1",
        householdId,
        command: putAway({ locationPath: ["basement"], quantity: 1 }),
      });
      await handleCommand(db, {
        userId: "u1",
        householdId,
        command: putAway({ locationPath: ["basement"], quantity: 1 }),
      });
      const usual = await handleCommand(db, {
        userId: "u1",
        householdId,
        command: { intent: "find_usual", itemText: "paper towels", quantity: 1 },
      });
      expect(usual.type).toBe("ok");
      if (usual.type === "ok") expect(usual.spoken.toLowerCase()).toContain("basement");
    });
  });

  it("asks which item when names are ambiguous", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      await handleCommand(db, {
        userId: "u1",
        householdId,
        command: putAway({ itemText: "paper towels", locationPath: ["kitchen"] }),
      });
      await handleCommand(db, {
        userId: "u1",
        householdId,
        command: putAway({ itemText: "bath towels", locationPath: ["bathroom"] }),
      });
      const asked = await handleCommand(db, {
        userId: "u1",
        householdId,
        command: { intent: "find", itemText: "towels", quantity: 1 },
      });
      expect(asked.type).toBe("clarification");
      if (asked.type === "clarification") {
        expect(asked.clarification.type).toBe("which_item");
      }
    });
  });

  it("hides household A data from user B", async () => {
    await withTestDb(async (db) => {
      const a = await createHousehold(db, { userId: "u1", name: "A" });
      const b = await createHousehold(db, { userId: "u2", name: "B" });
      await handleCommand(db, { userId: "u1", householdId: a.householdId, command: putAway() });
      const peek = await handleCommand(db, {
        userId: "u2",
        householdId: a.householdId,
        command: { intent: "find", itemText: "paper towels", quantity: 1 },
      });
      expect(peek).toMatchObject({ type: "error", code: "forbidden" });
      const own = await handleCommand(db, {
        userId: "u2",
        householdId: b.householdId,
        command: { intent: "find", itemText: "paper towels", quantity: 1 },
      });
      expect(own).toMatchObject({ type: "error", code: "unknown_item" });
    });
  });

  it("does not persist item or location when put-away quantity is 0", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      const failed = await handleCommand(db, {
        userId: "u1",
        householdId,
        command: putAway({ quantity: 0 }),
      });
      expect(failed.type).toBe("error");
      expect(await db.select().from(items)).toHaveLength(0);
      expect(await db.select().from(locations)).toHaveLength(0);
      const find = await handleCommand(db, {
        userId: "u1",
        householdId,
        command: { intent: "find", itemText: "paper towels", quantity: 1 },
      });
      expect(find).toMatchObject({ type: "error", code: "unknown_item" });
    });
  });

  it("speaks pre-decrement on-hand on clamped take-out", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      await handleCommand(db, { userId: "u1", householdId, command: putAway({ quantity: 2 }) });
      const clamped = await handleCommand(db, {
        userId: "u1",
        householdId,
        command: {
          intent: "take_out",
          itemText: "paper towels",
          quantity: 5,
          locationPath: ["basement"],
        },
      });
      expect(clamped.type).toBe("ok");
      if (clamped.type === "ok") {
        expect(clamped.spoken).toBe("Only 2 left in Basement. Marked 0.");
        expect(clamped.lots[0].quantity).toBe(0);
      }
    });
  });

  it("includes lot quantities on ambiguous location path candidates", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      await handleCommand(db, {
        userId: "u1",
        householdId,
        command: putAway({ locationPath: ["Hall closet"], quantity: 4 }),
      });
      await handleCommand(db, {
        userId: "u1",
        householdId,
        command: putAway({ locationPath: ["Hall cabinet"], quantity: 8 }),
      });
      const asked = await handleCommand(db, {
        userId: "u1",
        householdId,
        command: {
          intent: "take_out",
          itemText: "paper towels",
          quantity: 1,
          locationPath: ["hall"],
        },
      });
      expect(asked.type).toBe("clarification");
      if (asked.type === "clarification") {
        expect(asked.clarification.type).toBe("which_location");
        if (asked.clarification.type === "which_location") {
          expect(asked.clarification.candidates.map((c) => c.quantity).sort((a, b) => a - b)).toEqual([
            4, 8,
          ]);
        }
      }
    });
  });

  it("suggests catalog synonyms when take-out string match fails", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      await handleCommand(db, {
        userId: "u1",
        householdId,
        command: {
          intent: "put_away",
          itemText: "Kleenex",
          quantity: 1,
          locationPath: ["foyer"],
        },
      });
      const asked = await handleCommand(
        db,
        {
          userId: "u1",
          householdId,
          command: { intent: "take_out", itemText: "facial tissue", quantity: 1 },
        },
        {
          suggestItems: async (_spoken, catalog) => {
            const hit = catalog.find((row) => row.name === "Kleenex");
            return hit ? [hit] : [];
          },
        },
      );
      expect(asked).toMatchObject({
        type: "clarification",
        spoken: "Did you mean Kleenex?",
      });
      if (asked.type === "clarification") {
        expect(asked.clarification).toEqual({
          type: "which_item",
          candidates: [{ itemId: expect.any(String), name: "Kleenex" }],
        });
      }
    });
  });

  it("puts away a confirmed multi-item batch at one place", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "u1", name: "H" });
      const result = await handleCommand(db, {
        userId: "u1",
        householdId,
        command: {
          intent: "put_away_batch",
          confirmed: true,
          locationPath: ["basement", "shelves", "bottom shelf"],
          items: [
            { itemText: "dishwasher detergent", quantity: 1 },
            { itemText: "dawn", quantity: 2 },
          ],
        },
      });
      expect(result.type).toBe("ok");
      if (result.type === "ok") {
        expect(result.spoken.toLowerCase()).toContain("bottom shelf");
        expect(result.spoken.toLowerCase()).toContain("dishwasher detergent");
        expect(result.spoken.toLowerCase()).toContain("dawn");
      }
    });
  });
});
