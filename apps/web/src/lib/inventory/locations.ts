import { and, eq, isNull } from "drizzle-orm";
import { bestMatches, namesMatch } from "@putaway/shared";
import type { Database } from "../db/client";
import { locations } from "../db/schema";

export type LocationResolveOk = {
  ok: true;
  locationId: string;
  pathLabel: string;
};

export type LocationResolveFail = {
  ok: false;
  code: "unknown_location" | "ambiguous_location";
  spoken: string;
  candidates?: { locationId: string; pathLabel: string }[];
};

export type LocationResolveResult = LocationResolveOk | LocationResolveFail;

function titleCase(segment: string): string {
  return segment
    .trim()
    .split(/\s+/)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index === 0 || lower.length === 1) {
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      }
      return lower;
    })
    .join(" ");
}

export async function pathLabelFor(db: Database, locationId: string): Promise<string> {
  const names: string[] = [];
  let currentId: string | null = locationId;
  while (currentId) {
    const [row] = await db.select().from(locations).where(eq(locations.id, currentId)).limit(1);
    if (!row) break;
    names.unshift(row.name);
    currentId = row.parentId;
  }
  return names.join(" → ");
}

async function loadSiblings(
  db: Database,
  householdId: string,
  parentId: string | null,
) {
  return db
    .select()
    .from(locations)
    .where(
      and(
        eq(locations.householdId, householdId),
        parentId === null ? isNull(locations.parentId) : eq(locations.parentId, parentId),
        isNull(locations.archivedAt),
      ),
    );
}

export async function resolveLocationPath(
  db: Database,
  {
    householdId,
    segments,
    create,
  }: { householdId: string; segments: string[]; create: boolean },
): Promise<LocationResolveResult> {
  let parentId: string | null = null;
  let locationId = "";

  for (const segment of segments) {
    const siblings = await loadSiblings(db, householdId, parentId);
    const matches = bestMatches(segment, siblings, (s) => s.name);

    if (matches.length === 1) {
      locationId = matches[0].id;
      parentId = locationId;
      continue;
    }

    if (matches.length === 0) {
      if (!create) {
        return {
          ok: false,
          code: "unknown_location",
          spoken: `I don't have a place called ${segment}.`,
        };
      }
      const [inserted] = await db
        .insert(locations)
        .values({
          householdId,
          parentId,
          name: titleCase(segment),
        })
        .returning();
      locationId = inserted.id;
      parentId = locationId;
      continue;
    }

    const candidates = await Promise.all(
      matches.map(async (match) => ({
        locationId: match.id,
        pathLabel: await pathLabelFor(db, match.id),
      })),
    );
    return {
      ok: false,
      code: "ambiguous_location",
      spoken: `Which ${segment}?`,
      candidates,
    };
  }

  const pathLabel = await pathLabelFor(db, locationId);
  return { ok: true, locationId, pathLabel };
}
