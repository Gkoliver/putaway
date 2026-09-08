import { getDb, type Database } from "../../../../lib/db/client";
import { createInvite } from "../../../../lib/households";

export type InvitesPostDeps = {
  db: Database;
  getUserId: (req: Request) => Promise<string | null>;
};

export async function handleInvitesPost(
  req: Request,
  { db, getUserId }: InvitesPostDeps,
): Promise<Response> {
  const userId = await getUserId(req);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { householdId, email, role } = (await req.json()) as {
    householdId: string;
    email: string;
    role: unknown;
  };
  if (role !== "owner" && role !== "member") {
    return Response.json({ error: "invalid_role" }, { status: 400 });
  }
  try {
    const result = await createInvite(db, {
      householdId,
      email,
      role,
      createdByUserId: userId,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "only owners can create invites") {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    throw error;
  }
}

export async function POST(req: Request): Promise<Response> {
  const { getUserIdFromRequest } = await import("../../../../lib/auth");
  return handleInvitesPost(req, { db: getDb(), getUserId: getUserIdFromRequest });
}
