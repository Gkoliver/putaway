import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { BatchLine, Clarification } from "@putaway/shared";
import { colors, theme } from "./theme";

export function ClarificationPicker(props: {
  clarification: Clarification;
  disabled?: boolean;
  onChooseLocation: (locationId: string) => void;
  onChooseItem: (itemId: string) => void;
  onConfirmBatch?: (items: BatchLine[]) => void;
}) {
  const { clarification, disabled = false } = props;
  const [batchItems, setBatchItems] = useState<BatchLine[]>(
    clarification.type === "confirm_batch" ? clarification.items : [],
  );
  const [batchError, setBatchError] = useState<string | null>(null);

  useEffect(() => {
    if (clarification.type === "confirm_batch") {
      setBatchItems(clarification.items.map((line) => ({ ...line })));
      setBatchError(null);
    }
  }, [clarification]);

  if (clarification.type === "which_location") {
    return (
      <View style={theme.card}>
        {clarification.candidates.map((c, index) => (
          <View key={c.locationId}>
            {index > 0 ? <View style={theme.separator} /> : null}
            <Pressable
              disabled={disabled}
              onPress={() => {
                if (disabled) return;
                props.onChooseLocation(c.locationId);
              }}
              style={[theme.row, disabled && theme.primaryButtonDisabled]}
            >
              <Text style={theme.body}>{`${c.pathLabel} (${c.quantity})`}</Text>
            </Pressable>
          </View>
        ))}
      </View>
    );
  }
  if (clarification.type === "which_item") {
    return (
      <View style={theme.card}>
        {clarification.candidates.map((c, index) => (
          <View key={c.itemId}>
            {index > 0 ? <View style={theme.separator} /> : null}
            <Pressable
              disabled={disabled}
              onPress={() => {
                if (disabled) return;
                props.onChooseItem(c.itemId);
              }}
              style={[theme.row, disabled && theme.primaryButtonDisabled]}
            >
              <Text style={theme.body}>{c.name}</Text>
            </Pressable>
          </View>
        ))}
      </View>
    );
  }
  if (clarification.type === "confirm_batch") {
    return (
      <View style={{ gap: 12 }}>
        <Text style={theme.caption}>{clarification.pathLabel}</Text>
        <Text style={theme.caption}>Tap a name or quantity to edit</Text>
        <View style={theme.card}>
          {batchItems.map((line, index) => (
            <View key={`batch-line-${index}`}>
              {index > 0 ? <View style={theme.separator} /> : null}
              <View style={[theme.row, { gap: 8 }]}>
                <TextInput
                  accessibilityLabel={`item name ${index + 1}`}
                  editable={!disabled}
                  value={line.itemText}
                  onChangeText={(text) => {
                    setBatchItems((prev) =>
                      prev.map((row, i) => (i === index ? { ...row, itemText: text } : row)),
                    );
                    setBatchError(null);
                  }}
                  style={[theme.body, { flex: 1, paddingVertical: 0 }]}
                  placeholder="Item name"
                  placeholderTextColor={colors.label}
                />
                <TextInput
                  accessibilityLabel={`quantity ${index + 1}`}
                  editable={!disabled}
                  keyboardType="number-pad"
                  value={String(line.quantity)}
                  onChangeText={(text) => {
                    const digits = text.replace(/[^\d]/g, "");
                    const quantity = digits === "" ? 0 : Number(digits);
                    setBatchItems((prev) =>
                      prev.map((row, i) =>
                        i === index ? { ...row, quantity: Number.isFinite(quantity) ? quantity : 0 } : row,
                      ),
                    );
                    setBatchError(null);
                  }}
                  style={[theme.body, { minWidth: 40, textAlign: "right", paddingVertical: 0 }]}
                />
              </View>
            </View>
          ))}
        </View>
        {batchError ? <Text style={theme.error}>{batchError}</Text> : null}
        <Pressable
          accessibilityLabel="Confirm list"
          disabled={disabled || !props.onConfirmBatch}
          onPress={() => {
            if (disabled || !props.onConfirmBatch) return;
            const cleaned = batchItems
              .map((line) => ({
                itemText: line.itemText.trim(),
                quantity: line.quantity,
              }))
              .filter((line) => line.itemText.length > 0);
            if (cleaned.length === 0) {
              setBatchError("Add at least one item.");
              return;
            }
            if (cleaned.some((line) => !Number.isInteger(line.quantity) || line.quantity < 1)) {
              setBatchError("Each quantity must be at least 1.");
              return;
            }
            props.onConfirmBatch(cleaned);
          }}
          style={[theme.primaryButton, disabled && theme.primaryButtonDisabled]}
        >
          <Text style={theme.primaryButtonText}>Confirm</Text>
        </Pressable>
      </View>
    );
  }
  return <Text style={theme.body}>{clarification.message}</Text>;
}
