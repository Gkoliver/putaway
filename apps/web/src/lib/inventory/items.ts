import { eq } from "drizzle-orm";
import { bestMatches } from "@putaway/shared";
import type { Database } from "../db/client";
import { items } from "../db/schema";

export type ItemResolveOk = {
  ok: true;
  itemId: string;
  name: string;
};

export type ItemResolveFail = {
  ok: false;
  code: "unknown_item" | "ambiguous_item";
  spoken: string;
  candidates?: { itemId: string; name: string }[];
};

export type ItemResolveResult = ItemResolveOk | ItemResolveFail;

function readableName(itemText: string): string {
  return itemText
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export async function resolveItem(
  db: Database,
  {
    householdId,
    itemText,
    create,
  }: { householdId: string; itemText: string; create: boolean },
): Promise<ItemResolveResult> {
  const householdItems = await db.select().from(items).where(eq(items.householdId, householdId));
  const matches = bestMatches(itemText, householdItems, (item) => item.name);

  if (matches.length === 1) {
    return { ok: true, itemId: matches[0].id, name: matches[0].name };
  }

  if (matches.length === 0) {
    if (!create) {
      return {
        ok: false,
        code: "unknown_item",
        spoken: `I don't have ${itemText} yet.`,
      };
    }
    const [inserted] = await db
      .insert(items)
      .values({ householdId, name: readableName(itemText) })
      .returning();
    return { ok: true, itemId: inserted.id, name: inserted.name };
  }

  return {
    ok: false,
    code: "ambiguous_item",
    spoken: `Which ${itemText}?`,
    candidates: matches.map((match) => ({ itemId: match.id, name: match.name })),
  };
}
