import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { SessionProvider } from "../src/session";
import { colors } from "../src/theme";

export default function RootLayout() {
  return (
    <SessionProvider>
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerTitleStyle: { fontWeight: "600" },
          sceneStyle: { backgroundColor: colors.background },
          tabBarActiveTintColor: colors.tint,
          tabBarInactiveTintColor: colors.label,
          tabBarStyle: { backgroundColor: colors.card },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Talk",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="mic-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="list"
          options={{
            title: "List",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="list-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="places"
          options={{
            title: "Places",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="map-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="household"
          options={{
            title: "Household",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="edit"
          options={{
            href: null,
            title: "Item",
            tabBarStyle: { display: "none" },
          }}
        />
        <Tabs.Screen
          name="add"
          options={{
            href: null,
            title: "Add item",
            tabBarStyle: { display: "none" },
          }}
        />
        <Tabs.Screen
          name="place"
          options={{
            href: null,
            title: "Place",
            tabBarStyle: { display: "none" },
          }}
        />
        <Tabs.Screen
          name="place-edit"
          options={{
            href: null,
            title: "Place",
            tabBarStyle: { display: "none" },
          }}
        />
      </Tabs>
    </SessionProvider>
  );
}
