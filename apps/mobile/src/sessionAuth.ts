import { getCookie, getSetCookie } from "@better-auth/expo/client";

export const AUTH_COOKIE_STORAGE_KEY = "putaway_cookie";

export type AuthCookieStorage = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
};

export function cookieHeaderFromCallbackUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const cookie = new URL(url).searchParams.get("cookie");
    return cookie ? cookie : null;
  } catch {
    return null;
  }
}

export async function applyAuthCallbackUrl(
  url: string | null | undefined,
  storage: AuthCookieStorage,
): Promise<string | null> {
  const header = cookieHeaderFromCallbackUrl(url);
  if (!header) return null;
  const previous = await storage.getItemAsync(AUTH_COOKIE_STORAGE_KEY);
  const stored = getSetCookie(header, previous ?? undefined);
  await storage.setItemAsync(AUTH_COOKIE_STORAGE_KEY, stored);
  return getCookie(stored);
}

export async function importCookieFromInitialUrl(
  getInitialURL: () => Promise<string | null>,
  storage: AuthCookieStorage,
): Promise<string | null> {
  return applyAuthCallbackUrl(await getInitialURL(), storage);
}
