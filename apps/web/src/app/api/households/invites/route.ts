import { getDb } from "../../../../lib/db/client";
import { handleInvitesPost } from "./handlers";

export async function POST(req: Request): Promise<Response> {
  const { getUserIdFromRequest } = await import("../../../../lib/auth");
  return handleInvitesPost(req, { db: getDb(), getUserId: getUserIdFromRequest });
}
