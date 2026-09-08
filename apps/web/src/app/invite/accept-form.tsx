"use client";

import { useState } from "react";
import { acceptInviteAction } from "./actions";

function inviteMessage(error: string): string {
  if (error === "expired") return "Invite expired";
  if (error === "already_used") return "This invite was already used";
  if (error === "email_mismatch") return "This invite is for a different email.";
  if (error === "unauthorized") return "Sign in to accept this invite.";
  return "Invite not found";
}

export function AcceptInviteForm({ token }: { token: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  async function onSubmit(formData: FormData) {
    const result = await acceptInviteAction(formData);
    if ("error" in result) {
      setMessage(inviteMessage(result.error));
      return;
    }
    setJoined(true);
  }

  if (joined) return <p>You joined the household.</p>;
  if (message) return <p>{message}</p>;

  return (
    <form action={onSubmit}>
      <input type="hidden" name="token" value={token} />
      <button type="submit">Accept invite</button>
    </form>
  );
}
