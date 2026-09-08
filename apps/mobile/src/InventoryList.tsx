import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { fetchInventory, type InventoryRow } from "./api";
import { useSession } from "./session";

export function InventoryList() {
  const { apiBase, token, activeHouseholdId } = useSession();
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !activeHouseholdId) {
      setRows([]);
      return;
    }
    setError(null);
    try {
      const next = await fetchInventory({ apiBase, token, householdId: activeHouseholdId });
      setRows(Array.isArray(next) ? next : []);
    } catch {
      setError("Could not load inventory.");
    }
  }, [apiBase, token, activeHouseholdId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!token) return <Text>Sign in from the Household tab.</Text>;
  if (!activeHouseholdId) return <Text>Pick a household first.</Text>;

  return (
    <View>
      <Pressable onPress={() => void load()}>
        <Text>Refresh</Text>
      </Pressable>
      {error ? <Text>{error}</Text> : null}
      {rows.map((row) => (
        <Text key={`${row.itemId}:${row.locationId}`}>
          {`${row.itemName} — ${row.pathLabel} (${row.quantity})`}
        </Text>
      ))}
      {rows.length === 0 && !error ? <Text>No items yet.</Text> : null}
    </View>
  );
}
