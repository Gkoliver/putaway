import { useLocalSearchParams } from "expo-router";
import { EditLocationScreen } from "../src/EditLocationScreen";

export default function PlaceEditRoute() {
  const params = useLocalSearchParams<{ mode?: string; locationId?: string }>();
  const mode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const locationId = Array.isArray(params.locationId) ? params.locationId[0] : params.locationId;
  return <EditLocationScreen key={`${mode ?? "edit"}:${locationId ?? "new"}`} />;
}
