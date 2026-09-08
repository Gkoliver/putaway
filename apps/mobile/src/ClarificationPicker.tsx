import { Pressable, Text, View } from "react-native";
import type { Clarification } from "@putaway/shared";

export function ClarificationPicker(props: {
  clarification: Clarification;
  onChooseLocation: (locationId: string) => void;
  onChooseItem: (itemId: string) => void;
}) {
  const { clarification } = props;
  if (clarification.type === "which_location") {
    return (
      <View>
        {clarification.candidates.map((c) => (
          <Pressable
            key={c.locationId}
            onPress={() => props.onChooseLocation(c.locationId)}
          >
            <Text>{`${c.pathLabel} (${c.quantity})`}</Text>
          </Pressable>
        ))}
      </View>
    );
  }
  if (clarification.type === "which_item") {
    return (
      <View>
        {clarification.candidates.map((c) => (
          <Pressable key={c.itemId} onPress={() => props.onChooseItem(c.itemId)}>
            <Text>{c.name}</Text>
          </Pressable>
        ))}
      </View>
    );
  }
  return <Text>{clarification.message}</Text>;
}
