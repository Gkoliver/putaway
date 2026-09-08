import type { ReactNode } from "react";
import type { LocationTreeNode } from "../../../lib/inventory/queries";

export function LocationTree({
  nodes,
  renderNode,
}: {
  nodes: LocationTreeNode[];
  renderNode: (node: LocationTreeNode) => ReactNode;
}) {
  const ids = new Set(nodes.map((node) => node.id));
  const byParent = new Map<string | null, LocationTreeNode[]>();
  for (const node of nodes) {
    const parentKey = node.parentId && ids.has(node.parentId) ? node.parentId : null;
    const siblings = byParent.get(parentKey) ?? [];
    siblings.push(node);
    byParent.set(parentKey, siblings);
  }

  function renderList(parentId: string | null): ReactNode {
    const children = byParent.get(parentId) ?? [];
    if (children.length === 0) return null;
    return (
      <ul>
        {children.map((node) => (
          <li key={node.id}>
            {renderNode(node)}
            {renderList(node.id)}
          </li>
        ))}
      </ul>
    );
  }

  return renderList(null);
}
