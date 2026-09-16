import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { items, stockLots } from "../db/schema";
import { readableName } from "./items";
import { pathLabelFor, resolveLocationPath } from "./locations";
import { setLotQuantity } from "./lots";

export type EditLotOk = {
  ok: true;
  itemId: string;
  itemName: string;
  locationId: string;
  pathLabel: string;
  quantity: number;
};

export type EditLotFail = {
  ok: false;
  code: "unknown_item" | "unknown_location" | "duplicate_name" | "invalid";
  spoken: string;
};

export type EditLotResult = EditLotOk | EditLotFail;

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  while (current && typeof current === "object") {
    if ("code" in current && (current as { code: unknown }).code === "23505") return true;
    current = "cause" in current ? (current as { cause: unknown }).cause : undefined;
  }
  return false;
}

export async function editLot(
  db: Database,
  input: {
    householdId: string;
    itemId: string;
    locationId: string;
    name: string;
    quantity: number;
    locationPath: string[];
  },
): Promise<EditLotResult> {
  const itemName = readableName(input.name);
  const locationPath = input.locationPath.map((segment) => segment.trim()).filter(Boolean);
  if (!itemName) {
    return { ok: false, code: "invalid", spoken: "Type an item name." };
  }
  if (!Number.isInteger(input.quantity) || input.quantity < 0) {
    return { ok: false, code: "invalid", spoken: "Quantity must be zero or more." };
  }
  if (locationPath.length === 0) {
    return { ok: false, code: "invalid", spoken: "Type a location." };
  }

  try {
    return await db.transaction(async (tx) => {
      const conn = tx as unknown as Database;
      const [item] = await conn
        .select()
        .from(items)
        .where(and(eq(items.id, input.itemId), eq(items.householdId, input.householdId)))
        .limit(1);
      if (!item) {
        return {
          ok: false,
          code: "unknown_item",
          spoken: "I don't have that item yet.",
        } satisfies EditLotResult;
      }

      const [source] = await conn
        .select()
        .from(stockLots)
        .where(
          and(
            eq(stockLots.householdId, input.householdId),
            eq(stockLots.itemId, input.itemId),
            eq(stockLots.locationId, input.locationId),
          ),
        )
        .for("update")
        .limit(1);
      if (!source) {
        return {
          ok: false,
          code: "unknown_item",
          spoken: "I don't have that item yet.",
        } satisfies EditLotResult;
      }

      if (item.name !== itemName) {
        try {
          await conn.update(items).set({ name: itemName }).where(eq(items.id, item.id));
        } catch (error) {
          if (isUniqueViolation(error)) {
            return {
              ok: false,
              code: "duplicate_name",
              spoken: `You already have an item called ${itemName}.`,
            } satisfies EditLotResult;
          }
          throw error;
        }
      }

      const dest = await resolveLocationPath(conn, {
        householdId: input.householdId,
        segments: locationPath,
        create: true,
      });
      if (!dest.ok) {
        return {
          ok: false,
          code: "unknown_location",
          spoken: dest.spoken,
        } satisfies EditLotResult;
      }

      const at = new Date();
      if (dest.locationId === input.locationId) {
        await setLotQuantity(conn, {
          householdId: input.householdId,
          itemId: input.itemId,
          locationId: dest.locationId,
          quantity: input.quantity,
          at,
        });
        return {
          ok: true,
          itemId: input.itemId,
          itemName,
          locationId: dest.locationId,
          pathLabel: dest.pathLabel,
          quantity: input.quantity,
        } satisfies EditLotResult;
      }

      const [destLot] = await conn
        .select()
        .from(stockLots)
        .where(
          and(
            eq(stockLots.householdId, input.householdId),
            eq(stockLots.itemId, input.itemId),
            eq(stockLots.locationId, dest.locationId),
          ),
        )
        .for("update")
        .limit(1);
      const destQuantity = (destLot?.quantity ?? 0) + input.quantity;
      if (destQuantity > 0 || destLot) {
        await setLotQuantity(conn, {
          householdId: input.householdId,
          itemId: input.itemId,
          locationId: dest.locationId,
          quantity: destQuantity,
          at,
        });
      }
      await setLotQuantity(conn, {
        householdId: input.householdId,
        itemId: input.itemId,
        locationId: input.locationId,
        quantity: 0,
        at,
      });
      return {
        ok: true,
        itemId: input.itemId,
        itemName,
        locationId: dest.locationId,
        pathLabel: dest.pathLabel,
        quantity: destQuantity,
      } satisfies EditLotResult;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        code: "duplicate_name",
        spoken: `You already have an item called ${itemName}.`,
      };
    }
    throw error;
  }
}
