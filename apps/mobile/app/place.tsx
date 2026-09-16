import { useLocalSearchParams } from "expo-router";
import { PlaceContentsScreen } from "../src/PlaceContentsScreen";

export default function PlaceRoute() {
  const params = useLocalSearchParams<{ locationId?: string }>();
  const locationId = Array.isArray(params.locationId) ? params.locationId[0] : params.locationId;
  return <PlaceContentsScreen key={locationId ?? "place"} />;
}
