import { getDb, type Database } from "../../../../../lib/db/client";
import { acceptInvite } from "../../../../../lib/households";

export type AcceptInviteDeps = {
  db: Database;
  getSessionUser: (req: Request) => Promise<{ id: string; email: string } | null>;
};

export async function handleAcceptInvitePost(
  req: Request,
  { db, getSessionUser }: AcceptInviteDeps,
): Promise<Response> {
  const user = await getSessionUser(req);
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { token } = (await req.json()) as { token: string };
  const result = await acceptInvite(db, { token, userId: user.id, email: user.email });
  if ("error" in result) {
    return Response.json(result, { status: 400 });
  }
  return Response.json(result);
}

export async function POST(req: Request): Promise<Response> {
  const { getSessionUser } = await import("../../../../../lib/auth");
  return handleAcceptInvitePost(req, { db: getDb(), getSessionUser });
}
