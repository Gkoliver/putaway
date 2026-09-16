import { getDb, type Database } from "../../../../../lib/db/client";
import { requireMembership } from "../../../../../lib/households";
import {
  createLocation,
  moveLocation,
  renameLocation,
  type LocationWriteFail,
} from "../../../../../lib/inventory/locations";
import { listLocationTree } from "../../../../../lib/inventory/queries";

export type LocationsRouteDeps = {
  db: Database;
  getUserId: (req: Request) => Promise<string | null>;
};

function spokenFor(code: LocationWriteFail["code"]): string {
  switch (code) {
    case "forbidden":
      return "You cannot edit places.";
    case "archived":
      return "That place is archived.";
    case "duplicate_name":
      return "A place with that name already exists there.";
    case "invalid_parent":
      return "That parent place is not valid.";
  }
}

function failResponse(code: LocationWriteFail["code"]): Response {
  const status = code === "forbidden" ? 403 : code === "duplicate_name" ? 409 : 400;
  return Response.json({ error: code, spoken: spokenFor(code) }, { status });
}

export async function handleLocationsGet(
  req: Request,
  householdId: string,
  { db, getUserId }: LocationsRouteDeps,
): Promise<Response> {
  const userId = await getUserId(req);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const membership = await requireMembership(db, userId, householdId);
  if (!membership) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const rows = await listLocationTree(db, householdId);
  return Response.json(rows);
}

export async function handleLocationsPost(
  req: Request,
  householdId: string,
  { db, getUserId }: LocationsRouteDeps,
): Promise<Response> {
  const userId = await getUserId(req);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { name?: unknown; parentId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid", spoken: "Could not save." }, { status: 400 });
  }

  if (typeof body.name !== "string") {
    return Response.json({ error: "invalid", spoken: "Could not save." }, { status: 400 });
  }
  const parentId =
    body.parentId === null || body.parentId === undefined
      ? null
      : typeof body.parentId === "string"
        ? body.parentId
        : undefined;
  if (parentId === undefined) {
    return Response.json({ error: "invalid", spoken: "Could not save." }, { status: 400 });
  }

  const result = await createLocation(db, {
    userId,
    householdId,
    name: body.name,
    parentId,
  });
  if (!result.ok) return failResponse(result.code);
  return Response.json(result, { status: 201 });
}

export async function handleLocationsPatch(
  req: Request,
  householdId: string,
  { db, getUserId }: LocationsRouteDeps,
): Promise<Response> {
  const userId = await getUserId(req);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { locationId?: unknown; name?: unknown; parentId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid", spoken: "Could not save." }, { status: 400 });
  }

  if (typeof body.locationId !== "string") {
    return Response.json({ error: "invalid", spoken: "Could not save." }, { status: 400 });
  }

  const hasName = typeof body.name === "string";
  const hasParent =
    body.parentId === null || typeof body.parentId === "string";
  if (!hasName && !hasParent) {
    return Response.json({ error: "invalid", spoken: "Could not save." }, { status: 400 });
  }

  if (hasName) {
    const renamed = await renameLocation(db, {
      userId,
      householdId,
      locationId: body.locationId,
      name: body.name as string,
    });
    if (!renamed.ok) return failResponse(renamed.code);
  }

  if (hasParent) {
    const moved = await moveLocation(db, {
      userId,
      householdId,
      locationId: body.locationId,
      newParentId: body.parentId as string | null,
    });
    if (!moved.ok) return failResponse(moved.code);
  }

  return Response.json({ ok: true });
}

export async function GET(
  req: Request,
  context: { params: Promise<{ householdId: string }> },
): Promise<Response> {
  const { householdId } = await context.params;
  const { getUserIdFromRequest } = await import("../../../../../lib/auth");
  return handleLocationsGet(req, householdId, { db: getDb(), getUserId: getUserIdFromRequest });
}

export async function POST(
  req: Request,
  context: { params: Promise<{ householdId: string }> },
): Promise<Response> {
  const { householdId } = await context.params;
  const { getUserIdFromRequest } = await import("../../../../../lib/auth");
  return handleLocationsPost(req, householdId, { db: getDb(), getUserId: getUserIdFromRequest });
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ householdId: string }> },
): Promise<Response> {
  const { householdId } = await context.params;
  const { getUserIdFromRequest } = await import("../../../../../lib/auth");
  return handleLocationsPatch(req, householdId, { db: getDb(), getUserId: getUserIdFromRequest });
}
