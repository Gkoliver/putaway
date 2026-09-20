import { getDb } from "../../../../../lib/db/client";
import {
  handleLocationsGet,
  handleLocationsPatch,
  handleLocationsPost,
} from "./handlers";

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
