import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { randomUUID } from "expo-crypto";
import { useNavigation, useRouter } from "expo-router";
import { fetchLocations, submitCommand, type LocationRow } from "./api";
import { validateAddForm } from "./editForm";
import { useSession } from "./session";
import { colors, theme } from "./theme";

export function AddItemScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { apiBase, token, activeHouseholdId } = useSession();
  const [name, setName] = useState("");
  const [quantityText, setQuantityText] = useState("1");
  const [locationId, setLocationId] = useState<string | null>(null);
  const [places, setPlaces] = useState<LocationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token || !activeHouseholdId) return;
    void fetchLocations({ apiBase, token, householdId: activeHouseholdId })
      .then((rows) => setPlaces(Array.isArray(rows) ? rows : []))
      .catch(() => setError("Could not load places."));
  }, [apiBase, token, activeHouseholdId]);

  const onSave = useCallback(async () => {
    if (!token || !activeHouseholdId) {
      setError("Pick a household first.");
      return;
    }
    const invalid = validateAddForm({ name, quantityText, locationId });
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const outcome = await submitCommand({
        apiBase,
        token,
        householdId: activeHouseholdId,
        clientCommandId: randomUUID(),
        command: {
          intent: "put_away",
          itemText: name.trim(),
          quantity: Number(quantityText),
          locationId: locationId!,
        },
      });
      if (outcome.type === "error") {
        setError(outcome.spoken);
        return;
      }
      if (outcome.type === "clarification") {
        setError(outcome.spoken);
        return;
      }
      router.back();
    } catch {
      setError("Could not save.");
    } finally {
      setSaving(false);
    }
  }, [apiBase, token, activeHouseholdId, name, quantityText, locationId, router]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: "Add item",
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
  }, [navigation, onSave, router, saving]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={theme.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={theme.caption}>Name</Text>
      <TextInput
        accessibilityLabel="item name"
        value={name}
        onChangeText={setName}
        style={theme.input}
        placeholder="Paper towels"
        placeholderTextColor={colors.label}
        autoFocus
      />
      <Text style={theme.caption}>Quantity</Text>
      <TextInput
        accessibilityLabel="quantity"
        keyboardType="number-pad"
        value={quantityText}
        onChangeText={setQuantityText}
        style={theme.input}
        placeholderTextColor={colors.label}
      />
      <Text style={theme.caption}>Place</Text>
      {places.length === 0 ? (
        <Text style={theme.body}>No places yet. Add one on the Places tab first.</Text>
      ) : (
        <View style={theme.card}>
          {places.map((place, index) => {
            const selected = place.id === locationId;
            return (
              <View key={place.id}>
                {index > 0 ? <View style={theme.separator} /> : null}
                <Pressable
                  accessibilityLabel={`place ${place.pathLabel}`}
                  onPress={() => setLocationId(place.id)}
                  style={theme.row}
                >
                  <Text style={[theme.body, { flex: 1 }]}>{place.pathLabel}</Text>
                  {selected ? <Text style={theme.caption}>Selected</Text> : null}
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
      {error ? <Text style={theme.error}>{error}</Text> : null}
    </ScrollView>
  );
}
