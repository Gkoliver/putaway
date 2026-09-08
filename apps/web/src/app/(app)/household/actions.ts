"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../../../lib/db/client";
import { createHousehold, createInvite } from "../../../lib/households";
import { getSessionUser } from "../session";

async function requireUserId(): Promise<string> {
  const user = await getSessionUser();
  if (!user) throw new Error("unauthorized");
  return user.id;
}

export async function createHouseholdAction(formData: FormData) {
  const userId = await requireUserId();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await createHousehold(getDb(), { userId, name });
  revalidatePath("/household");
  revalidatePath("/inventory");
  revalidatePath("/locations");
}

export async function createInviteAction(formData: FormData) {
  const userId = await requireUserId();
  const householdId = String(formData.get("householdId") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  if (!email || (role !== "owner" && role !== "member")) return;
  await createInvite(getDb(), {
    householdId,
    email,
    role,
    createdByUserId: userId,
  });
  revalidatePath("/household");
}
