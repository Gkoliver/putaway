import { getDb, type Database } from "../../../../../lib/db/client";
import { requireMembership } from "../../../../../lib/households";
import { editLot } from "../../../../../lib/inventory/edit";
import { listInventory } from "../../../../../lib/inventory/queries";

export type InventoryRouteDeps = {
  db: Database;
  getUserId: (req: Request) => Promise<string | null>;
};

export type InventoryGetDeps = InventoryRouteDeps;

export async function handleInventoryGet(
  req: Request,
  householdId: string,
  { db, getUserId }: InventoryRouteDeps,
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

export async function handleInventoryPatch(
  req: Request,
  householdId: string,
  { db, getUserId }: InventoryRouteDeps,
): Promise<Response> {
  const userId = await getUserId(req);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const membership = await requireMembership(db, userId, householdId);
  if (!membership) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  let body: {
    itemId?: unknown;
    locationId?: unknown;
    name?: unknown;
    quantity?: unknown;
    locationPath?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid", spoken: "Could not save." }, { status: 400 });
  }

  const locationPath = Array.isArray(body.locationPath)
    ? body.locationPath.filter((segment): segment is string => typeof segment === "string")
    : [];
  if (
    typeof body.itemId !== "string" ||
    typeof body.locationId !== "string" ||
    typeof body.name !== "string" ||
    typeof body.quantity !== "number"
  ) {
    return Response.json({ error: "invalid", spoken: "Could not save." }, { status: 400 });
  }

  const result = await editLot(db, {
    householdId,
    itemId: body.itemId,
    locationId: body.locationId,
    name: body.name,
    quantity: body.quantity,
    locationPath,
  });
  if (!result.ok) {
    const status =
      result.code === "duplicate_name" ? 409 : result.code === "unknown_item" ? 404 : 400;
    return Response.json({ error: result.code, spoken: result.spoken }, { status });
  }
  return Response.json(result);
}

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
