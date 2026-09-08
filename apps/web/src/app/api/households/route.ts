import { eq } from "drizzle-orm";
import { getDb, type Database } from "../../../lib/db/client";
import { householdMembers, households } from "../../../lib/db/schema";
import { createHousehold } from "../../../lib/households";

export type HouseholdsDeps = {
  db: Database;
  getUserId: (req: Request) => Promise<string | null>;
};

export async function handleHouseholdsPost(
  req: Request,
  { db, getUserId }: HouseholdsDeps,
): Promise<Response> {
  const userId = await getUserId(req);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { name } = (await req.json()) as { name: string };
  const result = await createHousehold(db, { userId, name });
  return Response.json(result, { status: 201 });
}

export async function handleHouseholdsGet(
  req: Request,
  { db, getUserId }: HouseholdsDeps,
): Promise<Response> {
  const userId = await getUserId(req);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const rows = await db
    .select({
      householdId: households.id,
      name: households.name,
      role: householdMembers.role,
    })
    .from(householdMembers)
    .innerJoin(households, eq(householdMembers.householdId, households.id))
    .where(eq(householdMembers.userId, userId));
  return Response.json(rows);
}

export async function POST(req: Request): Promise<Response> {
  const { getUserIdFromRequest } = await import("../../../lib/auth");
  return handleHouseholdsPost(req, { db: getDb(), getUserId: getUserIdFromRequest });
}

export async function GET(req: Request): Promise<Response> {
  const { getUserIdFromRequest } = await import("../../../lib/auth");
  return handleHouseholdsGet(req, { db: getDb(), getUserId: getUserIdFromRequest });
}
