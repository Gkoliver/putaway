import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTestDb } from "./db/test";
import { acceptInvite, createHousehold, createInvite, requireMembership } from "./households";

describe("households", () => {
  it("makes the creator the owner", async () => {
    await withTestDb(async (db) => {
      const userId = "user-a";
      const { householdId } = await createHousehold(db, { userId, name: "Oliver house" });
      expect(await requireMembership(db, userId, householdId)).toEqual({ role: "owner" });
      expect(await requireMembership(db, "user-b", householdId)).toBeNull();
    });
  });

  it("lets an owner invite and the invitee join as member", async () => {
    await withTestDb(async (db) => {
      const owner = "user-a";
      const { householdId } = await createHousehold(db, { userId: owner, name: "Oliver house" });
      const { token } = await createInvite(db, {
        householdId,
        email: "brother@example.com",
        role: "member",
        createdByUserId: owner,
      });
      const accepted = await acceptInvite(db, {
        token,
        userId: "user-b",
        email: "brother@example.com",
      });
      expect(accepted).toEqual({ householdId });
      expect(await requireMembership(db, "user-b", householdId)).toEqual({ role: "member" });
    });
  });

  it("rejects a second accept and an expired invite", async () => {
    await withTestDb(async (db) => {
      const owner = "user-a";
      const { householdId } = await createHousehold(db, { userId: owner, name: "Oliver house" });
      const { token } = await createInvite(db, {
        householdId,
        email: "brother@example.com",
        role: "member",
        createdByUserId: owner,
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(
        await acceptInvite(db, { token, userId: "user-b", email: "brother@example.com" }),
      ).toEqual({ error: "expired" });
    });
  });

  it("rejects an already used invite", async () => {
    await withTestDb(async (db) => {
      const owner = "user-a";
      const { householdId } = await createHousehold(db, { userId: owner, name: "Oliver house" });
      const { token } = await createInvite(db, {
        householdId,
        email: "brother@example.com",
        role: "member",
        createdByUserId: owner,
      });
      await acceptInvite(db, { token, userId: "user-b", email: "brother@example.com" });
      expect(
        await acceptInvite(db, { token, userId: "user-c", email: "brother@example.com" }),
      ).toEqual({ error: "already_used" });
    });
  });

  it("rejects an invite when the email does not match", async () => {
    await withTestDb(async (db) => {
      const owner = "user-a";
      const { householdId } = await createHousehold(db, { userId: owner, name: "Oliver house" });
      const { token } = await createInvite(db, {
        householdId,
        email: "brother@example.com",
        role: "member",
        createdByUserId: owner,
      });
      expect(
        await acceptInvite(db, { token, userId: "user-b", email: "other@example.com" }),
      ).toEqual({ error: "email_mismatch" });
    });
  });

  it("rejects createInvite from a non-owner", async () => {
    await withTestDb(async (db) => {
      const owner = "user-a";
      const { householdId } = await createHousehold(db, { userId: owner, name: "Oliver house" });
      const { token } = await createInvite(db, {
        householdId,
        email: "brother@example.com",
        role: "member",
        createdByUserId: owner,
      });
      await acceptInvite(db, { token, userId: "user-b", email: "brother@example.com" });
      await expect(
        createInvite(db, {
          householdId,
          email: "cousin@example.com",
          role: "member",
          createdByUserId: "user-b",
        }),
      ).rejects.toThrow("only owners can create invites");
    });
  });
});
