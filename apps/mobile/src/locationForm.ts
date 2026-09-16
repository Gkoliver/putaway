export type LocationNode = {
  id: string;
  parentId: string | null;
  name: string;
  pathLabel: string;
};

export type PlaceTreeNode = LocationNode & {
  children: PlaceTreeNode[];
  hasChildren: boolean;
};

export type FlatPlaceRow = LocationNode & {
  depth: number;
  hasChildren: boolean;
};

export function validateLocationName(name: string): string | null {
  if (!name.trim()) return "Enter a place name.";
  return null;
}

/** IDs that cannot be a new parent for `locationId` (self + descendants). */
export function blockedParentIds(nodes: LocationNode[], locationId: string): Set<string> {
  const children = new Map<string | null, string[]>();
  for (const node of nodes) {
    const list = children.get(node.parentId) ?? [];
    list.push(node.id);
    children.set(node.parentId, list);
  }
  const blocked = new Set<string>([locationId]);
  const stack = [locationId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const childId of children.get(current) ?? []) {
      if (!blocked.has(childId)) {
        blocked.add(childId);
        stack.push(childId);
      }
    }
  }
  return blocked;
}

export function parentOptions(
  nodes: LocationNode[],
  locationId: string | null,
): { id: string | null; label: string }[] {
  const blocked = locationId ? blockedParentIds(nodes, locationId) : new Set<string>();
  const options: { id: string | null; label: string }[] = [{ id: null, label: "(root)" }];
  for (const node of nodes) {
    if (blocked.has(node.id)) continue;
    options.push({ id: node.id, label: node.pathLabel });
  }
  return options;
}

export function buildPlaceTree(nodes: LocationNode[]): PlaceTreeNode[] {
  const ids = new Set(nodes.map((node) => node.id));
  const byParent = new Map<string | null, LocationNode[]>();
  for (const node of nodes) {
    // Orphaned parent refs (missing/other household) surface as roots so the place isn't hidden.
    const parentKey = node.parentId && ids.has(node.parentId) ? node.parentId : null;
    const siblings = byParent.get(parentKey) ?? [];
    siblings.push(node);
    byParent.set(parentKey, siblings);
  }

  function build(parentId: string | null): PlaceTreeNode[] {
    const siblings = [...(byParent.get(parentId) ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    return siblings.map((node) => {
      const children = build(node.id);
      return { ...node, children, hasChildren: children.length > 0 };
    });
  }

  return build(null);
}

export function flattenPlaceTree(
  tree: PlaceTreeNode[],
  expandedIds: Set<string>,
  depth = 0,
): FlatPlaceRow[] {
  const rows: FlatPlaceRow[] = [];
  for (const node of tree) {
    rows.push({
      id: node.id,
      parentId: node.parentId,
      name: node.name,
      pathLabel: node.pathLabel,
      depth,
      hasChildren: node.hasChildren,
    });
    if (node.hasChildren && expandedIds.has(node.id)) {
      rows.push(...flattenPlaceTree(node.children, expandedIds, depth + 1));
    }
  }
  return rows;
}

/** Root id plus every descendant in the tree. */
export function descendantLocationIds(
  nodes: Pick<LocationNode, "id" | "parentId">[],
  rootId: string,
): Set<string> {
  const children = new Map<string | null, string[]>();
  for (const node of nodes) {
    const list = children.get(node.parentId) ?? [];
    list.push(node.id);
    children.set(node.parentId, list);
  }
  const ids = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const childId of children.get(current) ?? []) {
      if (!ids.has(childId)) {
        ids.add(childId);
        stack.push(childId);
      }
    }
  }
  return ids;
}

export function inventoryInPlaceSubtree<
  T extends { locationId: string; itemName: string; pathLabel: string },
>(inventory: T[], nodes: Pick<LocationNode, "id" | "parentId">[], locationId: string): T[] {
  const ids = descendantLocationIds(nodes, locationId);
  return inventory
    .filter((row) => ids.has(row.locationId))
    .sort((a, b) => {
      const byPath = a.pathLabel.localeCompare(b.pathLabel);
      if (byPath !== 0) return byPath;
      return a.itemName.localeCompare(b.itemName);
    });
}
