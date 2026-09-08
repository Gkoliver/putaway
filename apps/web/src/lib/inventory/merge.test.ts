import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { withTestDb } from "../db/test";
import { createHousehold, createInvite, acceptInvite } from "../households";
import { handleCommand } from "./handler";
import { applyMerge, previewMerge } from "./merge";
import { locations, stockLots } from "../db/schema";

describe("merge", () => {
  it("combines lots and archives the source", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "owner", name: "H" });
      await handleCommand(db, {
        userId: "owner",
        householdId,
        command: { intent: "put_away", itemText: "tape", quantity: 1, locationPath: ["downstairs"] },
      });
      await handleCommand(db, {
        userId: "owner",
        householdId,
        command: { intent: "put_away", itemText: "tape", quantity: 2, locationPath: ["basement"] },
      });
      const nodes = await db.select().from(locations);
      const source = nodes.find((n) => n.name.toLowerCase() === "downstairs")!;
      const target = nodes.find((n) => n.name.toLowerCase() === "basement")!;
      const preview = await previewMerge(db, {
        userId: "owner",
        householdId,
        sourceLocationId: source.id,
        targetLocationId: target.id,
      });
      expect(preview.ok).toBe(true);
      if (preview.ok) {
        expect(preview.lots).toEqual([
          { itemName: "Tape", sourceQty: 1, targetQty: 2, mergedQty: 3 },
        ]);
      }
      const applied = await applyMerge(db, {
        userId: "owner",
        householdId,
        sourceLocationId: source.id,
        targetLocationId: target.id,
      });
      expect(applied).toEqual({ ok: true });
      const lots = await db.select().from(stockLots);
      expect(lots.filter((l) => l.locationId === target.id)[0]?.quantity).toBe(3);
      const src = await db.select().from(locations).where(eq(locations.id, source.id));
      expect(src[0]?.archivedAt).not.toBeNull();
    });
  });

  it("rejects merge across households and non-owners", async () => {
    await withTestDb(async (db) => {
      const a = await createHousehold(db, { userId: "owner", name: "A" });
      const b = await createHousehold(db, { userId: "other", name: "B" });
      await handleCommand(db, {
        userId: "owner",
        householdId: a.householdId,
        command: { intent: "put_away", itemText: "tape", quantity: 1, locationPath: ["garage"] },
      });
      await handleCommand(db, {
        userId: "other",
        householdId: b.householdId,
        command: { intent: "put_away", itemText: "tape", quantity: 1, locationPath: ["garage"] },
      });
      const aLoc = (await db.select().from(locations))[0];
      const bLoc = (await db.select().from(locations))[1];
      const cross = await applyMerge(db, {
        userId: "owner",
        householdId: a.householdId,
        sourceLocationId: aLoc.id,
        targetLocationId: bLoc.id,
      });
      expect(cross).toMatchObject({ ok: false, code: "invalid_merge" });

      const { token } = await createInvite(db, {
        householdId: a.householdId,
        email: "member@example.com",
        role: "member",
        createdByUserId: "owner",
      });
      await acceptInvite(db, { token, userId: "member", email: "member@example.com" });
      const aNodes = await db.select().from(locations).where(eq(locations.householdId, a.householdId));
      const source = aNodes[0];
      const extra = await handleCommand(db, {
        userId: "owner",
        householdId: a.householdId,
        command: { intent: "put_away", itemText: "tape", quantity: 1, locationPath: ["shed"] },
      });
      expect(extra.type).toBe("ok");
      const target = (await db.select().from(locations).where(eq(locations.householdId, a.householdId))).find(
        (n) => n.id !== source.id,
      )!;
      const asMember = await applyMerge(db, {
        userId: "member",
        householdId: a.householdId,
        sourceLocationId: source.id,
        targetLocationId: target.id,
      });
      expect(asMember).toMatchObject({ ok: false, code: "forbidden" });
    });
  });

  it("rejects the same location id", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "owner", name: "H" });
      await handleCommand(db, {
        userId: "owner",
        householdId,
        command: { intent: "put_away", itemText: "tape", quantity: 1, locationPath: ["garage"] },
      });
      const [loc] = await db.select().from(locations);
      const result = await applyMerge(db, {
        userId: "owner",
        householdId,
        sourceLocationId: loc.id,
        targetLocationId: loc.id,
      });
      expect(result).toMatchObject({ ok: false, code: "invalid_merge" });
    });
  });

  it("keeps the higher putAwayCount and newer lastActivityAt", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "owner", name: "H" });
      await handleCommand(db, {
        userId: "owner",
        householdId,
        command: { intent: "put_away", itemText: "tape", quantity: 1, locationPath: ["downstairs"] },
      });
      await handleCommand(db, {
        userId: "owner",
        householdId,
        command: { intent: "put_away", itemText: "tape", quantity: 1, locationPath: ["basement"] },
      });
      await handleCommand(db, {
        userId: "owner",
        householdId,
        command: { intent: "put_away", itemText: "tape", quantity: 1, locationPath: ["basement"] },
      });
      const nodes = await db.select().from(locations);
      const source = nodes.find((n) => n.name.toLowerCase() === "downstairs")!;
      const target = nodes.find((n) => n.name.toLowerCase() === "basement")!;
      const older = new Date("2026-01-01T00:00:00Z");
      const newer = new Date("2026-09-07T12:00:00Z");
      await db.update(stockLots).set({ lastActivityAt: newer }).where(eq(stockLots.locationId, source.id));
      await db.update(stockLots).set({ lastActivityAt: older }).where(eq(stockLots.locationId, target.id));
      const applied = await applyMerge(db, {
        userId: "owner",
        householdId,
        sourceLocationId: source.id,
        targetLocationId: target.id,
      });
      expect(applied).toEqual({ ok: true });
      const [merged] = await db.select().from(stockLots).where(eq(stockLots.locationId, target.id));
      expect(merged.quantity).toBe(3);
      expect(merged.putAwayCount).toBe(2);
      expect(merged.lastActivityAt).toEqual(newer);
    });
  });

  it("does not reuse an archived source for a later put-away", async () => {
    await withTestDb(async (db) => {
      const { householdId } = await createHousehold(db, { userId: "owner", name: "H" });
      await handleCommand(db, {
        userId: "owner",
        householdId,
        command: { intent: "put_away", itemText: "tape", quantity: 1, locationPath: ["downstairs"] },
      });
      await handleCommand(db, {
        userId: "owner",
        householdId,
        command: { intent: "put_away", itemText: "tape", quantity: 1, locationPath: ["basement"] },
      });
      const nodes = await db.select().from(locations);
      const source = nodes.find((n) => n.name.toLowerCase() === "downstairs")!;
      const target = nodes.find((n) => n.name.toLowerCase() === "basement")!;
      await applyMerge(db, {
        userId: "owner",
        householdId,
        sourceLocationId: source.id,
        targetLocationId: target.id,
      });
      await handleCommand(db, {
        userId: "owner",
        householdId,
        command: { intent: "put_away", itemText: "tape", quantity: 1, locationPath: ["downstairs"] },
      });
      const after = await db.select().from(locations);
      const reused = after.find((n) => n.id === source.id);
      const created = after.find((n) => n.name.toLowerCase() === "downstairs" && n.id !== source.id);
      expect(reused?.archivedAt).not.toBeNull();
      expect(created).toBeDefined();
      expect(created?.archivedAt).toBeNull();
    });
  });
});
