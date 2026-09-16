import { getOpenAiClient } from "./client";
import {
  filterSuggestedItems,
  type ItemCatalogEntry,
} from "../inventory/items";

const SUGGEST_SYSTEM_PROMPT = `You map a spoken household item phrase to entries from a provided catalog.
Return JSON with itemIds: an array of catalog item id strings that could be what the user meant (synonyms, brands, generics).
Only use ids from the catalog. Prefer the best matches first. Return [] if none are plausible.
Examples: "facial tissue" → Kleenex; "tp" → Toilet Paper; "bin bags" → Trash Bags.`;

const SUGGEST_SCHEMA = {
  type: "object",
  properties: {
    itemIds: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["itemIds"],
  additionalProperties: false,
} as const;

const MAX_SUGGESTIONS = 5;

export async function suggestItemMatches(
  spoken: string,
  catalog: ItemCatalogEntry[],
): Promise<ItemCatalogEntry[]> {
  if (catalog.length === 0) return [];

  const openai = getOpenAiClient();
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SUGGEST_SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          spoken,
          catalog: catalog.map((entry) => ({ id: entry.itemId, name: entry.name })),
        }),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "item_suggestions",
        strict: true,
        schema: SUGGEST_SCHEMA,
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return [];
  const parsed = JSON.parse(content) as { itemIds?: unknown };
  const ids = Array.isArray(parsed.itemIds)
    ? parsed.itemIds.filter((id): id is string => typeof id === "string")
    : [];
  return filterSuggestedItems(catalog, ids).slice(0, MAX_SUGGESTIONS);
}
