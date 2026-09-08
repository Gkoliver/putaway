import { getDb } from "../../../lib/db/client";
import { listLocationTree } from "../../../lib/inventory/queries";
import { loadHouseholdState } from "../household-state";
import { applyMergeAction, moveLocationAction, previewMergeAction, renameLocationAction } from "./actions";
import { MergeForm } from "./merge-form";

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ householdId?: string }>;
}) {
  const { householdId } = await searchParams;
  const { user, household } = await loadHouseholdState(householdId);
  if (!user) return null;
  if (!household) return <p>Create a household first.</p>;

  const tree = await listLocationTree(getDb(), household.id);
  const canEdit = household.role === "owner";

  return (
    <main>
      <h1>Locations</h1>
      <ul>
        {tree.map((node) => (
          <li key={node.id}>
            <span>{node.pathLabel}</span>
            {canEdit ? (
              <>
                <form action={renameLocationAction}>
                  <input type="hidden" name="householdId" value={household.id} />
                  <input type="hidden" name="locationId" value={node.id} />
                  <label>
                    Name
                    <input name="name" defaultValue={node.name} />
                  </label>
                  <button type="submit">Rename</button>
                </form>
                <form action={moveLocationAction}>
                  <input type="hidden" name="householdId" value={household.id} />
                  <input type="hidden" name="locationId" value={node.id} />
                  <label>
                    New parent
                    <select name="newParentId" defaultValue={node.parentId ?? ""}>
                      <option value="">(root)</option>
                      {tree
                        .filter((candidate) => candidate.id !== node.id)
                        .map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.pathLabel}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button type="submit">Move</button>
                </form>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit ? (
        <MergeForm
          householdId={household.id}
          locations={tree.map((node) => ({ id: node.id, pathLabel: node.pathLabel }))}
          previewMerge={previewMergeAction}
          applyMerge={applyMergeAction}
        />
      ) : null}
    </main>
  );
}
