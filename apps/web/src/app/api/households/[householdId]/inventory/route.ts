import { getDb, type Database } from "../../../../../lib/db/client";
import { requireMembership } from "../../../../../lib/households";
import { listInventory } from "../../../../../lib/inventory/queries";

export type InventoryGetDeps = {
  db: Database;
  getUserId: (req: Request) => Promise<string | null>;
};

export async function handleInventoryGet(
  req: Request,
  householdId: string,
  { db, getUserId }: InventoryGetDeps,
): Promise<Response> {
  const userId = await getUserId(req);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const membership = await requireMembership(db, userId, householdId);
  if (!membership) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const rows = await listInventory(db, householdId);
  return Response.json(rows);
}

export async function GET(
  req: Request,
  context: { params: Promise<{ householdId: string }> },
): Promise<Response> {
  const { householdId } = await context.params;
  const { getUserIdFromRequest } = await import("../../../../../lib/auth");
  return handleInventoryGet(req, householdId, { db: getDb(), getUserId: getUserIdFromRequest });
}
