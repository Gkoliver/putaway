import { getDb } from "../../../../../lib/db/client";
import { handleAcceptInvitePost } from "./handlers";

export async function POST(req: Request): Promise<Response> {
  const { getSessionUser } = await import("../../../../../lib/auth");
  return handleAcceptInvitePost(req, { db: getDb(), getSessionUser });
}
