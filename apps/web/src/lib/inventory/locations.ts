import { and, eq, isNull } from "drizzle-orm";
import { bestMatches, namesMatch } from "@putaway/shared";
import type { Database } from "../db/client";
import { locations } from "../db/schema";
import { requireMembership } from "../households";

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
      if (/[A-Z]/.test(word)) return word;
      const lower = word.toLowerCase();
      if (index === 0 || lower.length === 1) {
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      }
      return lower;
    })
    .join(" ");
}

export async function pathLabelFor(
  db: Database,
  householdId: string,
  locationId: string,
): Promise<string> {
  const names: string[] = [];
  let currentId: string | null = locationId;
  while (currentId) {
    const [row] = await db
      .select()
      .from(locations)
      .where(and(eq(locations.id, currentId), eq(locations.householdId, householdId)))
      .limit(1);
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
  if (segments.length === 0 || segments.some((segment) => !segment.trim())) {
    const spokenSeg = segments.find((segment) => !segment.trim()) ?? "";
    return {
      ok: false,
      code: "unknown_location",
      spoken: `I don't have a place called ${spokenSeg}.`,
    };
  }

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
        pathLabel: await pathLabelFor(db, householdId, match.id),
      })),
    );
    return {
      ok: false,
      code: "ambiguous_location",
      spoken: `Which ${segment}?`,
      candidates,
    };
  }

  const pathLabel = await pathLabelFor(db, householdId, locationId);
  return { ok: true, locationId, pathLabel };
}

export type LocationWriteFail = {
  ok: false;
  code: "forbidden" | "archived" | "duplicate_name" | "invalid_parent";
};

export type LocationWriteResult = { ok: true } | LocationWriteFail;

async function requireOwner(
  db: Database,
  userId: string,
  householdId: string,
): Promise<LocationWriteFail | null> {
  const membership = await requireMembership(db, userId, householdId);
  if (!membership || membership.role !== "owner") {
    return { ok: false, code: "forbidden" };
  }
  return null;
}

async function loadOwnedLocation(
  db: Database,
  householdId: string,
  locationId: string,
) {
  const [row] = await db
    .select()
    .from(locations)
    .where(and(eq(locations.id, locationId), eq(locations.householdId, householdId)))
    .limit(1);
  return row ?? null;
}

async function hasSiblingName(
  db: Database,
  householdId: string,
  parentId: string | null,
  name: string,
  exceptId: string,
): Promise<boolean> {
  const siblings = await loadSiblings(db, householdId, parentId);
  const lower = name.toLowerCase();
  return siblings.some((sibling) => sibling.id !== exceptId && sibling.name.toLowerCase() === lower);
}

async function wouldCycle(
  db: Database,
  householdId: string,
  locationId: string,
  newParentId: string,
): Promise<boolean> {
  let currentId: string | null = newParentId;
  const seen = new Set<string>();
  while (currentId) {
    if (currentId === locationId) return true;
    if (seen.has(currentId)) return true;
    seen.add(currentId);
    const [row] = await db
      .select({ parentId: locations.parentId })
      .from(locations)
      .where(and(eq(locations.id, currentId), eq(locations.householdId, householdId)))
      .limit(1);
    if (!row) break;
    currentId = row.parentId;
  }
  return false;
}

export async function renameLocation(
  db: Database,
  {
    userId,
    householdId,
    locationId,
    name,
  }: { userId: string; householdId: string; locationId: string; name: string },
): Promise<LocationWriteResult> {
  const auth = await requireOwner(db, userId, householdId);
  if (auth) return auth;

  const row = await loadOwnedLocation(db, householdId, locationId);
  if (!row) return { ok: false, code: "forbidden" };
  if (row.archivedAt) return { ok: false, code: "archived" };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, code: "duplicate_name" };
  if (await hasSiblingName(db, householdId, row.parentId, trimmed, locationId)) {
    return { ok: false, code: "duplicate_name" };
  }

  await db
    .update(locations)
    .set({ name: trimmed, updatedAt: new Date() })
    .where(eq(locations.id, locationId));
  return { ok: true };
}

export async function moveLocation(
  db: Database,
  {
    userId,
    householdId,
    locationId,
    newParentId,
  }: { userId: string; householdId: string; locationId: string; newParentId: string | null },
): Promise<LocationWriteResult> {
  const auth = await requireOwner(db, userId, householdId);
  if (auth) return auth;

  const row = await loadOwnedLocation(db, householdId, locationId);
  if (!row) return { ok: false, code: "forbidden" };
  if (row.archivedAt) return { ok: false, code: "archived" };

  if (newParentId) {
    const parent = await loadOwnedLocation(db, householdId, newParentId);
    if (!parent) return { ok: false, code: "invalid_parent" };
    if (parent.archivedAt) return { ok: false, code: "archived" };
    if (await wouldCycle(db, householdId, locationId, newParentId)) {
      return { ok: false, code: "invalid_parent" };
    }
  }

  if (await hasSiblingName(db, householdId, newParentId, row.name, locationId)) {
    return { ok: false, code: "duplicate_name" };
  }

  await db
    .update(locations)
    .set({ parentId: newParentId, updatedAt: new Date() })
    .where(eq(locations.id, locationId));
  return { ok: true };
}
