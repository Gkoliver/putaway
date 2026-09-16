import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { createHousehold, fetchHouseholds, type HouseholdRow } from "./api";
import { authClient } from "./auth";
import { useSession } from "./session";
import { applyAuthCallbackUrl } from "./sessionAuth";
import { colors, theme } from "./theme";

WebBrowser.maybeCompleteAuthSession();

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
  const [devLink, setDevLink] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

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

  const completeMagicLink = useCallback(
    async (verifyUrl: string) => {
      setOpening(true);
      setError(null);
      try {
        const callbackURL = Linking.createURL("/");
        const result = await WebBrowser.openAuthSessionAsync(verifyUrl, callbackURL);
        if (result.type !== "success" || !("url" in result) || !result.url) {
          setError("Sign-in was cancelled. Tap Open sign-in link to try again.");
          return;
        }
        await applyAuthCallbackUrl(result.url, SecureStore);
        const next = await refreshToken();
        if (!next) {
          setError("Signed in on the server, but the app did not get a session. Tap Open sign-in link again.");
        }
      } catch {
        setError("Could not open the sign-in link.");
      } finally {
        setOpening(false);
      }
    },
    [refreshToken],
  );

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
    let link: string | null = null;
    try {
      const res = await fetch(`${apiBase}/api/dev/magic-link`);
      if (res.ok) {
        const body = (await res.json()) as { url: string | null };
        link = body.url;
        setDevLink(body.url);
      }
    } catch {
      setDevLink(null);
    }
    setSent(true);
    if (link) {
      await completeMagicLink(link);
    } else {
      setError("Link was created, but this app could not fetch it. Is the API running on port 3000?");
    }
  }

  async function onCreate() {
    if (!token) return;
    if (!name.trim()) {
      setError("Type a household name in the box, then tap Create household.");
      return;
    }
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
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={theme.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={theme.body}>
          Local dev does not send email. Tap Send and a browser will open to finish sign-in on this
          simulator.
        </Text>
        {sent ? <Text style={theme.caption}>Link ready.</Text> : null}
        <TextInput
          accessibilityLabel="email"
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email"
          placeholderTextColor={colors.label}
          value={email}
          onChangeText={setEmail}
          style={theme.input}
        />
        <Pressable
          disabled={opening}
          onPress={() => void sendMagicLink()}
          style={[theme.primaryButton, opening ? { opacity: 0.5 } : null]}
        >
          <Text style={theme.primaryButtonText}>
            {opening ? "Opening sign-in…" : "Send sign-in link"}
          </Text>
        </Pressable>
        {devLink ? (
          <Pressable disabled={opening} onPress={() => void completeMagicLink(devLink)}>
            <Text style={theme.link}>Open sign-in link again</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => void refreshToken()}>
          <Text style={theme.link}>Refresh session</Text>
        </Pressable>
        {error ? <Text style={theme.error}>{error}</Text> : null}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={theme.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={theme.title}>Signed in</Text>
      {activeHouseholdId ? (
        <Text style={theme.body}>
          Active household is selected. You can put items away on the Talk tab.
        </Text>
      ) : (
        <Text style={theme.body}>
          You don&apos;t have a household yet. Tap the name field, type something like Home, then
          tap Create household.
        </Text>
      )}
      {households.length > 0 ? (
        <View style={theme.card}>
          {households.map((row, index) => {
            const active = row.householdId === activeHouseholdId;
            return (
              <View key={row.householdId}>
                {index > 0 ? <View style={theme.separator} /> : null}
                <Pressable
                  onPress={() => void setActiveHouseholdId(row.householdId)}
                  style={theme.row}
                  accessibilityState={{ selected: active }}
                >
                  <Text style={theme.body}>{row.name}</Text>
                  {active ? <Text style={theme.link}>✓</Text> : null}
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}
      <Text style={[theme.caption, { fontWeight: "600", color: colors.text }]}>Household name</Text>
      <TextInput
        accessibilityLabel="household name"
        placeholder="Home"
        placeholderTextColor={colors.label}
        value={name}
        onChangeText={setName}
        style={theme.input}
      />
      <Pressable onPress={() => void onCreate()} style={theme.primaryButton}>
        <Text style={theme.primaryButtonText}>Create household</Text>
      </Pressable>
      <Pressable onPress={() => void signOut()}>
        <Text style={theme.link}>Sign out</Text>
      </Pressable>
      {error ? <Text style={theme.error}>{error}</Text> : null}
    </ScrollView>
  );
}
