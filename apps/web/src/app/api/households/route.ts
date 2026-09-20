import { getDb } from "../../../lib/db/client";
import { handleHouseholdsGet, handleHouseholdsPost } from "./handlers";

export async function POST(req: Request): Promise<Response> {
  const { getUserIdFromRequest } = await import("../../../lib/auth");
  return handleHouseholdsPost(req, { db: getDb(), getUserId: getUserIdFromRequest });
}

export async function GET(req: Request): Promise<Response> {
  const { getUserIdFromRequest } = await import("../../../lib/auth");
  return handleHouseholdsGet(req, { db: getDb(), getUserId: getUserIdFromRequest });
}
