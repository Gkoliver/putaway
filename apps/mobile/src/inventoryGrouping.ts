import type { InventoryRow } from "./api";

export type InventoryLocationGroup = {
  locationId: string;
  pathLabel: string;
  rows: InventoryRow[];
};

export function filterInventory(rows: InventoryRow[], query: string): InventoryRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(
    (row) =>
      row.itemName.toLowerCase().includes(needle) ||
      row.pathLabel.toLowerCase().includes(needle),
  );
}

export function groupInventoryByLocation(rows: InventoryRow[]): InventoryLocationGroup[] {
  const byLocation = new Map<string, InventoryLocationGroup>();
  for (const row of rows) {
    const existing = byLocation.get(row.locationId);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    byLocation.set(row.locationId, {
      locationId: row.locationId,
      pathLabel: row.pathLabel,
      rows: [row],
    });
  }

  return [...byLocation.values()]
    .map((section) => ({
      ...section,
      rows: [...section.rows].sort((a, b) => a.itemName.localeCompare(b.itemName)),
    }))
    .sort((a, b) => {
      const byPath = a.pathLabel.localeCompare(b.pathLabel);
      if (byPath !== 0) return byPath;
      return a.locationId.localeCompare(b.locationId);
    });
}
