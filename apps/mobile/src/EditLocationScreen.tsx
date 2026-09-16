import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { createLocation, fetchLocations, updateLocation, type LocationRow } from "./api";
import { parentOptions, validateLocationName } from "./locationForm";
import { useSession } from "./session";
import { colors, theme } from "./theme";

function param(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function EditLocationScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{
    mode?: string;
    locationId?: string;
    name?: string;
    parentId?: string;
  }>();
  const mode = param(params.mode) === "create" ? "create" : "edit";
  const locationId = param(params.locationId);
  const { apiBase, token, activeHouseholdId } = useSession();
  const [name, setName] = useState(param(params.name));
  const [parentId, setParentId] = useState<string | null>(
    param(params.parentId).length > 0 ? param(params.parentId) : null,
  );
  const [nodes, setNodes] = useState<LocationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Same /place route is reused; reset form when the target place changes.
  useEffect(() => {
    setName(param(params.name));
    setParentId(param(params.parentId).length > 0 ? param(params.parentId) : null);
    setError(null);
  }, [params.mode, params.locationId, params.name, params.parentId]);

  useEffect(() => {
    if (!token || !activeHouseholdId) return;
    void fetchLocations({ apiBase, token, householdId: activeHouseholdId })
      .then(setNodes)
      .catch(() => setError("Could not load places."));
  }, [apiBase, token, activeHouseholdId]);

  const onSave = useCallback(async () => {
    if (!token || !activeHouseholdId) {
      setError("Pick a household first.");
      return;
    }
    const invalid = validateLocationName(name);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      if (mode === "create") {
        const result = await createLocation({
          apiBase,
          token,
          householdId: activeHouseholdId,
          name,
          parentId,
        });
        if (!result.ok) {
          setError(result.spoken);
          return;
        }
      } else {
        if (!locationId) {
          setError("Could not save.");
          return;
        }
        const result = await updateLocation({
          apiBase,
          token,
          householdId: activeHouseholdId,
          locationId,
          name,
          parentId,
        });
        if (!result.ok) {
          setError(result.spoken);
          return;
        }
      }
      router.back();
    } catch {
      setError("Could not save.");
    } finally {
      setSaving(false);
    }
  }, [apiBase, token, activeHouseholdId, name, parentId, mode, locationId, router]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: mode === "create" ? "New place" : "Place",
      tabBarStyle: { display: "none" },
      headerLeft: () => (
        <Pressable onPress={() => router.back()} hitSlop={8} disabled={saving}>
          <Text style={theme.link}>Cancel</Text>
        </Pressable>
      ),
      headerRight: () => (
        <Pressable onPress={() => void onSave()} hitSlop={8} disabled={saving}>
          <Text style={[theme.link, saving && theme.primaryButtonDisabled]}>Save</Text>
        </Pressable>
      ),
    });
  }, [navigation, onSave, router, saving, mode]);

  const options = parentOptions(nodes, mode === "edit" ? locationId || null : null);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={theme.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={theme.caption}>Name</Text>
      <TextInput
        accessibilityLabel="place name"
        value={name}
        onChangeText={setName}
        style={theme.input}
        placeholder="Basement"
        placeholderTextColor={colors.label}
      />
      <Text style={theme.caption}>Parent</Text>
      <View style={theme.card}>
        {options.map((option, index) => {
          const selected =
            (option.id === null && parentId === null) ||
            (option.id !== null && option.id === parentId);
          return (
            <View key={option.id ?? "root"}>
              {index > 0 ? <View style={theme.separator} /> : null}
              <Pressable
                accessibilityLabel={`parent ${option.label}`}
                onPress={() => setParentId(option.id)}
                style={theme.row}
              >
                <Text style={theme.body}>{option.label}</Text>
                {selected ? <Text style={theme.caption}>Selected</Text> : null}
              </Pressable>
            </View>
          );
        })}
      </View>
      {error ? <Text style={theme.error}>{error}</Text> : null}
    </ScrollView>
  );
}
