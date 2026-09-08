import { Tabs } from "expo-router";
import { SessionProvider } from "../src/session";

export default function RootLayout() {
  return (
    <SessionProvider>
      <Tabs>
        <Tabs.Screen name="index" options={{ title: "Talk" }} />
        <Tabs.Screen name="list" options={{ title: "List" }} />
        <Tabs.Screen name="household" options={{ title: "Household" }} />
      </Tabs>
    </SessionProvider>
  );
}
