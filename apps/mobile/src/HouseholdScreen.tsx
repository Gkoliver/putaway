import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import * as Linking from "expo-linking";
import { createHousehold, fetchHouseholds, type HouseholdRow } from "./api";
import { authClient } from "./auth";
import { useSession } from "./session";

export function HouseholdScreen() {
  const {
    apiBase,
    token,
    activeHouseholdId,
    setActiveHouseholdId,
    clearActiveHouseholdId,
    refreshToken,
    signOut,
  } = useSession();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [name, setName] = useState("");
  const [households, setHouseholds] = useState<HouseholdRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadHouseholds = useCallback(async () => {
    if (!token) {
      setHouseholds([]);
      return;
    }
    try {
      const list = await fetchHouseholds({ apiBase, token });
      setHouseholds(list);
      if (activeHouseholdId && !list.some((row) => row.householdId === activeHouseholdId)) {
        await clearActiveHouseholdId();
      } else if (!activeHouseholdId && list[0]) {
        await setActiveHouseholdId(list[0].householdId);
      }
    } catch {
      setError("Could not load households.");
    }
  }, [
    apiBase,
    token,
    activeHouseholdId,
    setActiveHouseholdId,
    clearActiveHouseholdId,
  ]);

  useEffect(() => {
    void loadHouseholds();
  }, [loadHouseholds]);

  async function sendMagicLink() {
    setError(null);
    const callbackURL = Linking.createURL("/");
    const { error: sendError } = await authClient.signIn.magicLink({
      email,
      callbackURL,
    });
    if (sendError) {
      setError("Could not send sign-in link.");
      return;
    }
    setSent(true);
  }

  async function onCreate() {
    if (!token || !name.trim()) return;
    setError(null);
    try {
      const created = await createHousehold({ apiBase, token, name: name.trim() });
      await setActiveHouseholdId(created.householdId);
      setName("");
      await loadHouseholds();
    } catch {
      setError("Could not create household.");
    }
  }

  if (!token) {
    return (
      <View>
        <Text>Open the emailed magic link on this device to sign in.</Text>
        {sent ? <Text>Check your email for a sign-in link.</Text> : null}
        <TextInput
          accessibilityLabel="email"
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
        />
        <Pressable onPress={() => void sendMagicLink()}>
          <Text>Send sign-in link</Text>
        </Pressable>
        <Pressable onPress={() => void refreshToken()}>
          <Text>I opened the link</Text>
        </Pressable>
        {error ? <Text>{error}</Text> : null}
      </View>
    );
  }

  return (
    <View>
      <Text>Signed in</Text>
      {households.map((row) => (
        <Pressable
          key={row.householdId}
          onPress={() => void setActiveHouseholdId(row.householdId)}
        >
          <Text>
            {`${row.name}${row.householdId === activeHouseholdId ? " (active)" : ""}`}
          </Text>
        </Pressable>
      ))}
      <TextInput
        accessibilityLabel="household name"
        placeholder="New household"
        value={name}
        onChangeText={setName}
      />
      <Pressable onPress={() => void onCreate()}>
        <Text>Create household</Text>
      </Pressable>
      <Pressable onPress={() => void signOut()}>
        <Text>Sign out</Text>
      </Pressable>
      {error ? <Text>{error}</Text> : null}
    </View>
  );
}
