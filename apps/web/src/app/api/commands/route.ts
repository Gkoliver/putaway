import { getDb } from "../../../lib/db/client";
import { handleCommandsPost } from "./handlers";

async function realGetUserId(req: Request): Promise<string | null> {
  const { getUserIdFromRequest } = await import("../../../lib/auth");
  return getUserIdFromRequest(req);
}

export async function POST(req: Request): Promise<Response> {
  return handleCommandsPost(req, { db: getDb(), getUserId: realGetUserId });
}
