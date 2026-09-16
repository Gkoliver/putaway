import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput } from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { editInventory } from "./api";
import { parseLocationPath, validateEditForm } from "./editForm";
import { useSession } from "./session";
import { colors, theme } from "./theme";

function param(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function EditItemScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{
    itemId?: string;
    locationId?: string;
    itemName?: string;
    pathLabel?: string;
    quantity?: string;
  }>();
  const { apiBase, token, activeHouseholdId } = useSession();
  const [name, setName] = useState(param(params.itemName));
  const [quantityText, setQuantityText] = useState(param(params.quantity));
  const [locationLabel, setLocationLabel] = useState(param(params.pathLabel));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(param(params.itemName));
    setQuantityText(param(params.quantity));
    setLocationLabel(param(params.pathLabel));
    setError(null);
  }, [params.itemId, params.locationId, params.itemName, params.pathLabel, params.quantity]);

  const onSave = useCallback(async () => {
    if (!token || !activeHouseholdId) {
      setError("Pick a household first.");
      return;
    }
    const invalid = validateEditForm({ name, quantityText, locationLabel });
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const result = await editInventory({
        apiBase,
        token,
        householdId: activeHouseholdId,
        itemId: param(params.itemId),
        locationId: param(params.locationId),
        name,
        quantity: Number(quantityText),
        locationPath: parseLocationPath(locationLabel),
      });
      if (!result.ok) {
        setError(result.spoken);
        return;
      }
      router.back();
    } catch {
      setError("Could not save.");
    } finally {
      setSaving(false);
    }
  }, [
    apiBase,
    token,
    activeHouseholdId,
    name,
    quantityText,
    locationLabel,
    params.itemId,
    params.locationId,
    router,
  ]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: "Item",
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
        placeholderTextColor={colors.label}
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
      <Text style={theme.caption}>Location</Text>
      <TextInput
        accessibilityLabel="location"
        value={locationLabel}
        onChangeText={setLocationLabel}
        style={theme.input}
        placeholder="Basement → Cabinet"
        placeholderTextColor={colors.label}
      />
      {error ? <Text style={theme.error}>{error}</Text> : null}
    </ScrollView>
  );
}
