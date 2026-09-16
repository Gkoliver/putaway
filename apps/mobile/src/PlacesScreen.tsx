import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { fetchHouseholds, fetchLocations, type LocationRow } from "./api";
import { buildPlaceTree, flattenPlaceTree } from "./locationForm";
import { useSession } from "./session";
import { colors, theme } from "./theme";

export function PlacesScreen() {
  const router = useRouter();
  const { apiBase, token, activeHouseholdId } = useSession();
  const [rows, setRows] = useState<LocationRow[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !activeHouseholdId) {
      setRows([]);
      setCanEdit(false);
      return;
    }
    setError(null);
    try {
      const [next, households] = await Promise.all([
        fetchLocations({ apiBase, token, householdId: activeHouseholdId }),
        fetchHouseholds({ apiBase, token }),
      ]);
      const list = Array.isArray(next) ? next : [];
      setRows(list);
      setExpandedIds((prev) => {
        if (prev.size > 0) {
          const ids = new Set(list.map((row) => row.id));
          return new Set([...prev].filter((id) => ids.has(id)));
        }
        // First load: expand every parent that has children.
        const parents = new Set(
          list.filter((row) => list.some((child) => child.parentId === row.id)).map((row) => row.id),
        );
        return parents;
      });
      const active = households.find((row) => row.householdId === activeHouseholdId);
      setCanEdit(active?.role === "owner");
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
        setError("Could not load places.");
      }
    }
  }, [apiBase, token, activeHouseholdId, router]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const visibleRows = flattenPlaceTree(buildPlaceTree(rows), expandedIds);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={theme.content}
    >
      <View style={theme.toolbar}>
        <Text style={theme.title}>Places</Text>
        <View style={{ flexDirection: "row", gap: 16 }}>
          {canEdit ? (
            <Pressable
              onPress={() =>
                router.push({ pathname: "/place-edit", params: { mode: "create" } })
              }
              hitSlop={8}
            >
              <Text style={theme.link}>Add</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => void load()} hitSlop={8}>
            <Text style={theme.link}>Refresh</Text>
          </Pressable>
        </View>
      </View>
      {error ? <Text style={theme.error}>{error}</Text> : null}
      {!canEdit ? (
        <Text style={theme.caption}>Only the household owner can edit places.</Text>
      ) : null}
      {rows.length === 0 && !error ? (
        <Text style={theme.body}>No places yet.</Text>
      ) : (
        <View style={theme.card}>
          {visibleRows.map((row, index) => {
            const expanded = expandedIds.has(row.id);
            return (
              <View key={row.id}>
                {index > 0 ? <View style={theme.separator} /> : null}
                <View style={[theme.row, { paddingLeft: 16 + row.depth * 20 }]}>
                  {row.hasChildren ? (
                    <Pressable
                      accessibilityLabel={expanded ? `Collapse ${row.name}` : `Expand ${row.name}`}
                      onPress={() => toggleExpanded(row.id)}
                      hitSlop={8}
                      style={{ width: 28, alignItems: "center", justifyContent: "center" }}
                    >
                      <Ionicons
                        name={expanded ? "chevron-down" : "chevron-forward"}
                        size={18}
                        color={colors.label}
                      />
                    </Pressable>
                  ) : (
                    <View style={{ width: 28 }} />
                  )}
                  <Pressable
                    accessibilityLabel={row.pathLabel}
                    onPress={() =>
                      router.push({
                        pathname: "/place",
                        params: {
                          locationId: row.id,
                          name: row.name,
                          pathLabel: row.pathLabel,
                          parentId: row.parentId ?? "",
                        },
                      })
                    }
                    style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}
                  >
                    <Text style={[theme.body, { flex: 1 }]}>{row.name}</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.label} />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}
