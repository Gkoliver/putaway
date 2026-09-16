import { useLocalSearchParams } from "expo-router";
import { EditItemScreen } from "../src/EditItemScreen";

export default function EditRoute() {
  const params = useLocalSearchParams<{ itemId?: string; locationId?: string }>();
  const itemId = Array.isArray(params.itemId) ? params.itemId[0] : params.itemId;
  const locationId = Array.isArray(params.locationId) ? params.locationId[0] : params.locationId;
  return <EditItemScreen key={`${itemId ?? ""}:${locationId ?? ""}`} />;
}
