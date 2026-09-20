import { getDb } from "../../../../../lib/db/client";
import { handleInventoryGet, handleInventoryPatch } from "./handlers";

export async function GET(
  req: Request,
  context: { params: Promise<{ householdId: string }> },
): Promise<Response> {
  const { householdId } = await context.params;
  const { getUserIdFromRequest } = await import("../../../../../lib/auth");
  return handleInventoryGet(req, householdId, { db: getDb(), getUserId: getUserIdFromRequest });
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ householdId: string }> },
): Promise<Response> {
  const { householdId } = await context.params;
  const { getUserIdFromRequest } = await import("../../../../../lib/auth");
  return handleInventoryPatch(req, householdId, { db: getDb(), getUserId: getUserIdFromRequest });
}
