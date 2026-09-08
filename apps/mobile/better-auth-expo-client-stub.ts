import { parseSetCookieHeader } from "better-auth/cookies/utils";

type StoredCookie = { value: string; expires: string | null };

function parseStored(prevCookie?: string): Record<string, StoredCookie> {
  if (!prevCookie) return {};
  try {
    const parsed = JSON.parse(prevCookie) as Record<string, StoredCookie>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Matches `@better-auth/expo/client` `getSetCookie` JSON storage. */
export function getSetCookie(header: string, prevCookie?: string): string {
  const parsed = parseSetCookieHeader(header);
  const toSetCookie = parseStored(prevCookie);
  parsed.forEach((cookie, key) => {
    const expiresAt = cookie.expires;
    const maxAge = cookie["max-age"];
    if (maxAge !== undefined && Number(maxAge) <= 0) {
      delete toSetCookie[key];
      return;
    }
    const expires = maxAge
      ? new Date(Date.now() + Number(maxAge) * 1000)
      : expiresAt
        ? new Date(String(expiresAt))
        : null;
    if (expires && expires.getTime() <= Date.now()) {
      delete toSetCookie[key];
      return;
    }
    toSetCookie[key] = {
      value: cookie.value,
      expires: expires ? expires.toISOString() : null,
    };
  });
  return JSON.stringify(toSetCookie);
}

/** Matches `@better-auth/expo/client` `getCookie`. */
export function getCookie(cookie: string | null): string {
  const parsed = parseStored(cookie ?? undefined);
  return Object.entries(parsed).reduce((acc, [key, value]) => {
    if (value.expires && new Date(value.expires) < new Date()) return acc;
    return acc ? `${acc}; ${key}=${value.value}` : `${key}=${value.value}`;
  }, "");
}
