import { eq } from "drizzle-orm";
import { getDb } from "../../lib/db/client";
import { invites } from "../../lib/db/schema";
import { getSessionUser } from "../(app)/session";
import { SignInForm } from "../(app)/sign-in-form";
import { AcceptInviteForm } from "./accept-form";

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) return <p>Invite not found</p>;

  try {
    const [invite] = await getDb().select().from(invites).where(eq(invites.token, token)).limit(1);
    if (!invite) return <p>Invite not found</p>;
    if (invite.acceptedAt) return <p>This invite was already used</p>;
    if (invite.expiresAt.getTime() < Date.now()) return <p>Invite expired</p>;
  } catch {
    return <p>Invite not found</p>;
  }

  const user = await getSessionUser();
  const callbackURL = `/invite?token=${encodeURIComponent(token)}`;
  if (!user) {
    return (
      <main>
        <p>Sign in to accept this invite.</p>
        <SignInForm callbackURL={callbackURL} />
      </main>
    );
  }

  return (
    <main>
      <AcceptInviteForm token={token} />
    </main>
  );
}
