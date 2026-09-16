import { getDb } from "../../../lib/db/client";
import { listInventory } from "../../../lib/inventory/queries";
import { loadHouseholdState } from "../household-state";
import { TryCommandForm } from "./try-command-form";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ householdId?: string }>;
}) {
  const { householdId } = await searchParams;
  const { user, household } = await loadHouseholdState(householdId);
  if (!user) return null;
  if (!household) return <p>Create a household first.</p>;

  const rows = await listInventory(getDb(), household.id);

  return (
    <main>
      <h1>Inventory</h1>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Location</th>
            <th>Quantity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.itemId}-${row.locationId}`}>
              <td>{row.itemName}</td>
              <td>{row.pathLabel}</td>
              <td>{row.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <TryCommandForm householdId={household.id} />
    </main>
  );
}
