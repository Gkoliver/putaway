import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import {
  fetchHouseholds,
  fetchInventory,
  fetchLocations,
  type InventoryRow,
  type LocationRow,
} from "./api";
import { groupInventoryByLocation } from "./inventoryGrouping";
import { inventoryInPlaceSubtree } from "./locationForm";
import { useSession } from "./session";
import { colors, theme } from "./theme";

function param(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function PlaceContentsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{
    locationId?: string;
    name?: string;
    pathLabel?: string;
    parentId?: string;
  }>();
  const locationId = param(params.locationId);
  const title = param(params.name) || "Place";
  const pathLabel = param(params.pathLabel) || title;
  const parentId = param(params.parentId);
  const { apiBase, token, activeHouseholdId } = useSession();
  const [nodes, setNodes] = useState<LocationRow[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !activeHouseholdId || !locationId) {
      setNodes([]);
      setInventory([]);
      setCanEdit(false);
      return;
    }
    setError(null);
    try {
      const [places, items, households] = await Promise.all([
        fetchLocations({ apiBase, token, householdId: activeHouseholdId }),
        fetchInventory({ apiBase, token, householdId: activeHouseholdId }),
        fetchHouseholds({ apiBase, token }),
      ]);
      setNodes(Array.isArray(places) ? places : []);
      setInventory(Array.isArray(items) ? items : []);
      const active = households.find((row) => row.householdId === activeHouseholdId);
      setCanEdit(active?.role === "owner");
    } catch {
      setError("Could not load place.");
    }
  }, [apiBase, token, activeHouseholdId, locationId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    setError(null);
  }, [locationId]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title,
      tabBarStyle: { display: "none" },
      headerLeft: () => (
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={theme.link}>Back</Text>
        </Pressable>
      ),
      headerRight: () =>
        canEdit ? (
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/place-edit",
                params: {
                  mode: "edit",
                  locationId,
                  name: title,
                  parentId,
                },
              })
            }
            hitSlop={8}
          >
            <Text style={theme.link}>Edit</Text>
          </Pressable>
        ) : null,
    });
  }, [navigation, router, title, canEdit, locationId, parentId]);

  const rows = inventoryInPlaceSubtree(inventory, nodes, locationId);
  const sections = groupInventoryByLocation(rows);
  const place = nodes.find((node) => node.id === locationId);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={theme.content}
    >
      <Text style={theme.caption}>{place?.pathLabel ?? pathLabel}</Text>
      {error ? <Text style={theme.error}>{error}</Text> : null}
      {sections.length === 0 && !error ? (
        <Text style={theme.body}>Nothing stored here yet.</Text>
      ) : (
        sections.map((section) => (
          <View key={section.locationId} style={theme.section}>
            {section.locationId !== locationId || sections.length > 1 ? (
              <Text style={theme.sectionHeader}>{section.pathLabel}</Text>
            ) : null}
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
      )}
    </ScrollView>
  );
}
