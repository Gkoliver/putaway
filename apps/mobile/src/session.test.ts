import { describe, expect, it } from "vitest";
import {
  applyAuthCallbackUrl,
  cookieHeaderFromCallbackUrl,
  importCookieFromInitialUrl,
} from "./sessionAuth";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    async getItemAsync(key: string) {
      return data[key] ?? null;
    },
    async setItemAsync(key: string, value: string) {
      data[key] = value;
    },
  };
}

describe("cookieHeaderFromCallbackUrl", () => {
  it("extracts the cookie query from a putaway deep link", () => {
    expect(
      cookieHeaderFromCallbackUrl(
        "putaway:///?cookie=better-auth.session_token=tok123; Path=/",
      ),
    ).toBe("better-auth.session_token=tok123; Path=/");
  });

  it("returns null when the URL has no cookie param", () => {
    expect(cookieHeaderFromCallbackUrl("putaway://talk")).toBeNull();
  });
});

describe("applyAuthCallbackUrl", () => {
  it("stores the session cookie so getCookie yields the token", async () => {
    const storage = fakeStorage();
    const cookie = await applyAuthCallbackUrl(
      "putaway:///?cookie=better-auth.session_token=tok123; Path=/",
      storage,
    );
    expect(cookie).toMatch(/better-auth\.session_token=tok123/);
    expect(storage.data.putaway_cookie).toBeTruthy();
    expect(
      JSON.parse(storage.data.putaway_cookie)["better-auth.session_token"].value,
    ).toBe("tok123");
  });

  it("does not write storage when the URL has no cookie param", async () => {
    const storage = fakeStorage();
    const cookie = await applyAuthCallbackUrl("putaway://talk", storage);
    expect(cookie).toBeNull();
    expect(storage.data.putaway_cookie).toBeUndefined();
  });

  it("imports a cookie from Linking.getInitialURL on cold start", async () => {
    const storage = fakeStorage();
    const getInitialURL = async () =>
      "putaway:///?cookie=better-auth.session_token=tok123; Path=/";
    const cookie = await importCookieFromInitialUrl(getInitialURL, storage);
    expect(cookie).toMatch(/better-auth\.session_token=tok123/);
  });
});
