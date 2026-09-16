import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { fetchInventory, type InventoryRow } from "./api";
import { filterInventory, groupInventoryByLocation } from "./inventoryGrouping";
import { useSession } from "./session";
import { theme, colors } from "./theme";

export function InventoryList() {
  const router = useRouter();
  const { apiBase, token, activeHouseholdId } = useSession();
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [query, setQuery] = useState("");
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
    } catch (err) {
      setRows([]);
      const status =
        err && typeof err === "object" && "status" in err && typeof err.status === "number"
          ? err.status
          : undefined;
      if (status === 401 || status === 403) {
        setError("Pick a household first.");
        router.push("/household");
      } else {
        setError("Could not load inventory.");
      }
    }
  }, [apiBase, token, activeHouseholdId, router]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!token) {
    return (
      <View style={theme.screen}>
        <Text style={theme.body}>Sign in from the Household tab.</Text>
      </View>
    );
  }
  if (!activeHouseholdId) {
    return (
      <View style={theme.screen}>
        <Text style={theme.body}>Pick a household first.</Text>
      </View>
    );
  }

  const filtered = filterInventory(rows, query);
  const sections = groupInventoryByLocation(filtered);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={theme.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={theme.toolbar}>
        <Text style={theme.title}>Inventory</Text>
        <View style={{ flexDirection: "row", gap: 16 }}>
          <Pressable onPress={() => router.push("/add")} hitSlop={8}>
            <Text style={theme.link}>Add</Text>
          </Pressable>
          <Pressable onPress={() => void load()} hitSlop={8}>
            <Text style={theme.link}>Refresh</Text>
          </Pressable>
        </View>
      </View>
      <TextInput
        accessibilityLabel="search inventory"
        value={query}
        onChangeText={setQuery}
        placeholder="Search items or places"
        placeholderTextColor={colors.label}
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
        style={theme.input}
      />
      {error ? <Text style={theme.error}>{error}</Text> : null}
      {sections.length > 0
        ? sections.map((section) => (
            <View key={section.locationId} style={theme.section}>
              <Text style={theme.sectionHeader}>{section.pathLabel}</Text>
              <View style={theme.card}>
                {section.rows.map((row, index) => (
                  <View key={`${row.itemId}:${row.locationId}`}>
                    {index > 0 ? <View style={theme.separator} /> : null}
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: "/edit",
                          params: {
                            itemId: row.itemId,
                            locationId: row.locationId,
                            itemName: row.itemName,
                            pathLabel: row.pathLabel,
                            quantity: String(row.quantity),
                          },
                        })
                      }
                      style={theme.row}
                    >
                      <Text style={[theme.body, { flex: 1 }]}>{row.itemName}</Text>
                      <Text style={theme.body}>{row.quantity}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          ))
        : null}
      {rows.length === 0 && !error ? <Text style={theme.caption}>No items yet.</Text> : null}
      {rows.length > 0 && sections.length === 0 && !error ? (
        <Text style={theme.caption}>No matches.</Text>
      ) : null}
    </ScrollView>
  );
}
