import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import { apiBase, authClient } from "./auth";

const TOKEN_KEY = "putaway.bearerToken";
const HOUSEHOLD_KEY = "putaway.activeHouseholdId";

type SessionValue = {
  apiBase: string;
  token: string | null;
  activeHouseholdId: string | null;
  ready: boolean;
  setActiveHouseholdId: (id: string) => Promise<void>;
  refreshToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

async function readBearerFromAuth(): Promise<string | null> {
  const session = await authClient.getSession();
  const token = session.data?.session?.token;
  if (token) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    return token;
  }
  const cookies = await authClient.getCookie();
  const match = cookies.match(/better-auth\.session_token=([^;]+)/);
  if (!match?.[1]) return null;
  const fromCookie = decodeURIComponent(match[1]);
  await SecureStore.setItemAsync(TOKEN_KEY, fromCookie);
  return fromCookie;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [activeHouseholdId, setHouseholdId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const refreshToken = useCallback(async () => {
    const next = (await readBearerFromAuth()) ?? (await SecureStore.getItemAsync(TOKEN_KEY));
    setToken(next);
    return next;
  }, []);

  const setActiveHouseholdId = useCallback(async (id: string) => {
    setHouseholdId(id);
    await SecureStore.setItemAsync(HOUSEHOLD_KEY, id);
  }, []);

  const signOut = useCallback(async () => {
    await authClient.signOut();
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
  }, []);

  useEffect(() => {
    void (async () => {
      const storedHousehold = await SecureStore.getItemAsync(HOUSEHOLD_KEY);
      if (storedHousehold) setHouseholdId(storedHousehold);
      const storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
      if (storedToken) setToken(storedToken);
      await refreshToken();
      setReady(true);
    })();
  }, [refreshToken]);

  useEffect(() => {
    const sub = Linking.addEventListener("url", () => {
      void refreshToken();
    });
    return () => sub.remove();
  }, [refreshToken]);

  const value = useMemo(
    () => ({
      apiBase,
      token,
      activeHouseholdId,
      ready,
      setActiveHouseholdId,
      refreshToken,
      signOut,
    }),
    [token, activeHouseholdId, ready, setActiveHouseholdId, refreshToken, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
