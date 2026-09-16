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

export type ItemCatalogEntry = { itemId: string; name: string };

export type ItemSuggester = (
  spoken: string,
  catalog: ItemCatalogEntry[],
) => Promise<ItemCatalogEntry[]>;

export function readableName(itemText: string): string {
  return itemText
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function filterSuggestedItems(
  catalog: ItemCatalogEntry[],
  suggestedIds: string[],
): ItemCatalogEntry[] {
  const byId = new Map(catalog.map((entry) => [entry.itemId, entry]));
  const seen = new Set<string>();
  const out: ItemCatalogEntry[] = [];
  for (const id of suggestedIds) {
    if (seen.has(id)) continue;
    const entry = byId.get(id);
    if (!entry) continue;
    seen.add(id);
    out.push(entry);
  }
  return out;
}

export function didYouMeanSpoken(candidates: ItemCatalogEntry[]): string {
  if (candidates.length === 1) return `Did you mean ${candidates[0].name}?`;
  if (candidates.length === 2) {
    return `Did you mean ${candidates[0].name} or ${candidates[1].name}?`;
  }
  const head = candidates
    .slice(0, -1)
    .map((c) => c.name)
    .join(", ");
  return `Did you mean ${head}, or ${candidates[candidates.length - 1].name}?`;
}

export async function resolveItem(
  db: Database,
  {
    householdId,
    itemText,
    create,
    suggest,
  }: {
    householdId: string;
    itemText: string;
    create: boolean;
    suggest?: ItemSuggester;
  },
): Promise<ItemResolveResult> {
  const householdItems = await db.select().from(items).where(eq(items.householdId, householdId));
  const matches = bestMatches(itemText, householdItems, (item) => item.name);

  if (matches.length === 1) {
    return { ok: true, itemId: matches[0].id, name: matches[0].name };
  }

  if (matches.length === 0) {
    if (!create) {
      if (suggest && householdItems.length > 0) {
        const catalog = householdItems.map((item) => ({
          itemId: item.id,
          name: item.name,
        }));
        try {
          const raw = await suggest(itemText, catalog);
          const suggestions = filterSuggestedItems(
            catalog,
            raw.map((entry) => entry.itemId),
          );
          if (suggestions.length > 0) {
            return {
              ok: false,
              code: "ambiguous_item",
              spoken: didYouMeanSpoken(suggestions),
              candidates: suggestions,
            };
          }
        } catch (error) {
          console.warn(
            "[resolveItem] suggest-on-miss failed; returning unknown_item",
            error instanceof Error ? error.message : error,
          );
        }
      }
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
