import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "./db/client";
import { householdMembers, households, invites } from "./db/schema";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function createHousehold(
  db: Database,
  { userId, name }: { userId: string; name: string },
): Promise<{ householdId: string; role: "owner" }> {
  return db.transaction(async (tx) => {
    const [household] = await tx.insert(households).values({ name }).returning();
    await tx.insert(householdMembers).values({
      householdId: household.id,
      userId,
      role: "owner",
    });
    return { householdId: household.id, role: "owner" };
  });
}

export async function requireMembership(
  db: Database,
  userId: string,
  householdId: string,
): Promise<{ role: "owner" | "member" } | null> {
  const [row] = await db
    .select({ role: householdMembers.role })
    .from(householdMembers)
    .where(
      and(eq(householdMembers.userId, userId), eq(householdMembers.householdId, householdId)),
    )
    .limit(1);
  if (!row) return null;
  return { role: row.role as "owner" | "member" };
}

export async function createInvite(
  db: Database,
  {
    householdId,
    email,
    role,
    createdByUserId,
    expiresAt,
  }: {
    householdId: string;
    email: string;
    role: "owner" | "member";
    createdByUserId: string;
    expiresAt?: Date;
  },
): Promise<{ token: string }> {
  const membership = await requireMembership(db, createdByUserId, householdId);
  if (membership?.role !== "owner") {
    throw new Error("only owners can create invites");
  }
  const token = randomUUID();
  await db.insert(invites).values({
    householdId,
    email,
    role,
    token,
    expiresAt: expiresAt ?? new Date(Date.now() + SEVEN_DAYS_MS),
  });
  return { token };
}

export async function acceptInvite(
  db: Database,
  { token, userId, email }: { token: string; userId: string; email: string },
): Promise<{ householdId: string } | { error: "expired" | "already_used" | "email_mismatch" }> {
  return db.transaction(async (tx) => {
    const [invite] = await tx.select().from(invites).where(eq(invites.token, token)).limit(1);
    if (!invite) {
      throw new Error("invite not found");
    }
    if (invite.acceptedAt) {
      return { error: "already_used" as const };
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      return { error: "expired" as const };
    }
    if (invite.email.toLowerCase() !== email.toLowerCase()) {
      return { error: "email_mismatch" as const };
    }
    const [claimed] = await tx
      .update(invites)
      .set({ acceptedAt: new Date() })
      .where(and(eq(invites.id, invite.id), isNull(invites.acceptedAt)))
      .returning();
    if (!claimed) {
      return { error: "already_used" as const };
    }
    await tx.insert(householdMembers).values({
      householdId: invite.householdId,
      userId,
      role: invite.role,
    });
    return { householdId: invite.householdId };
  });
}
