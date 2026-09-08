"use server";

import { acceptInvite } from "../../lib/households";
import { getDb } from "../../lib/db/client";
import { getSessionUser } from "../(app)/session";

export async function acceptInviteAction(
  formData: FormData,
): Promise<{ ok: true } | { error: "expired" | "already_used" | "email_mismatch" | "not_found" | "unauthorized" }> {
  const user = await getSessionUser();
  if (!user) return { error: "unauthorized" };
  const token = String(formData.get("token") ?? "");
  const result = await acceptInvite(getDb(), {
    token,
    userId: user.id,
    email: user.email,
  });
  if ("error" in result) return result;
  return { ok: true };
}
