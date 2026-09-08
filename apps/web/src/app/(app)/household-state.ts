import { eq } from "drizzle-orm";
import { getDb } from "../../lib/db/client";
import { householdMembers, households } from "../../lib/db/schema";
import { getSessionUser } from "./session";

export type HouseholdSummary = {
  id: string;
  name: string;
  role: "owner" | "member";
};

export async function loadHouseholdState(householdId?: string): Promise<{
  user: { id: string; email: string } | null;
  household: HouseholdSummary | null;
  households: HouseholdSummary[];
}> {
  const user = await getSessionUser();
  if (!user) return { user: null, household: null, households: [] };

  const db = getDb();
  const rows = await db
    .select({
      id: households.id,
      name: households.name,
      role: householdMembers.role,
    })
    .from(householdMembers)
    .innerJoin(households, eq(householdMembers.householdId, households.id))
    .where(eq(householdMembers.userId, user.id));

  const list: HouseholdSummary[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role as "owner" | "member",
  }));
  const household =
    (householdId ? list.find((row) => row.id === householdId) : undefined) ?? list[0] ?? null;
  return { user, household, households: list };
}
