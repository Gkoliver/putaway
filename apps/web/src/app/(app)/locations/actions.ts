"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../../../lib/db/client";
import { applyMerge, previewMerge } from "../../../lib/inventory/merge";
import { moveLocation, renameLocation } from "../../../lib/inventory/locations";
import { getSessionUser } from "../session";

async function requireUserId(): Promise<string> {
  const user = await getSessionUser();
  if (!user) throw new Error("unauthorized");
  return user.id;
}

export async function previewMergeAction(input: {
  householdId: string;
  sourceLocationId: string;
  targetLocationId: string;
}) {
  const userId = await requireUserId();
  return previewMerge(getDb(), { ...input, userId });
}

export async function applyMergeAction(input: {
  householdId: string;
  sourceLocationId: string;
  targetLocationId: string;
}) {
  const userId = await requireUserId();
  const result = await applyMerge(getDb(), { ...input, userId });
  if (result.ok) revalidatePath("/locations");
  return result;
}

export async function renameLocationAction(formData: FormData) {
  const userId = await requireUserId();
  const householdId = String(formData.get("householdId") ?? "");
  const locationId = String(formData.get("locationId") ?? "");
  const name = String(formData.get("name") ?? "");
  await renameLocation(getDb(), { userId, householdId, locationId, name });
  revalidatePath("/locations");
}

export async function moveLocationAction(formData: FormData) {
  const userId = await requireUserId();
  const householdId = String(formData.get("householdId") ?? "");
  const locationId = String(formData.get("locationId") ?? "");
  const rawParent = String(formData.get("newParentId") ?? "");
  const newParentId = rawParent.length === 0 ? null : rawParent;
  await moveLocation(getDb(), { userId, householdId, locationId, newParentId });
  revalidatePath("/locations");
}
