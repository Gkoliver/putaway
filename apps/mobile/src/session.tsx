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
import { apiBase, signOut as signOutFromApi } from "./auth";
import {
  applyAuthCallbackUrl,
  AUTH_TOKEN_STORAGE_KEY,
  importTokenFromInitialUrl,
} from "./sessionAuth";

const HOUSEHOLD_KEY = "putaway.activeHouseholdId";

type SessionValue = {
  apiBase: string;
  token: string | null;
  activeHouseholdId: string | null;
  ready: boolean;
  setActiveHouseholdId: (id: string) => Promise<void>;
  clearActiveHouseholdId: () => Promise<void>;
  refreshToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [activeHouseholdId, setHouseholdId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const refreshToken = useCallback(async () => {
    const next = await SecureStore.getItemAsync(AUTH_TOKEN_STORAGE_KEY);
    setToken(next);
    return next;
  }, []);

  const setActiveHouseholdId = useCallback(async (id: string) => {
    setHouseholdId(id);
    await SecureStore.setItemAsync(HOUSEHOLD_KEY, id);
  }, []);

  const clearActiveHouseholdId = useCallback(async () => {
    setHouseholdId(null);
    await SecureStore.deleteItemAsync(HOUSEHOLD_KEY);
  }, []);

  const signOut = useCallback(async () => {
    try {
      if (token) await signOutFromApi(apiBase, token);
    } finally {
      await SecureStore.deleteItemAsync(AUTH_TOKEN_STORAGE_KEY);
      await SecureStore.deleteItemAsync(HOUSEHOLD_KEY);
      setToken(null);
      setHouseholdId(null);
    }
  }, [token]);

  useEffect(() => {
    void (async () => {
      const storedHousehold = await SecureStore.getItemAsync(HOUSEHOLD_KEY);
      if (storedHousehold) setHouseholdId(storedHousehold);
      const storedToken = await SecureStore.getItemAsync(AUTH_TOKEN_STORAGE_KEY);
      if (storedToken) setToken(storedToken);
      try {
        const imported = await importTokenFromInitialUrl(() => Linking.getInitialURL(), SecureStore);
        if (imported) setToken(imported);
      } catch {
        // Invalid or expired links should not prevent the app from starting.
      }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    const sub = Linking.addEventListener("url", (event) => {
      void (async () => {
        try {
          const imported = await applyAuthCallbackUrl(event.url, SecureStore);
          if (imported) setToken(imported);
        } catch {
          // The sign-in screen handles verification errors for links entered there.
        }
      })();
    });
    return () => sub.remove();
  }, []);

  const value = useMemo(
    () => ({
      apiBase,
      token,
      activeHouseholdId,
      ready,
      setActiveHouseholdId,
      clearActiveHouseholdId,
      refreshToken,
      signOut,
    }),
    [token, activeHouseholdId, ready, setActiveHouseholdId, clearActiveHouseholdId, refreshToken, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
