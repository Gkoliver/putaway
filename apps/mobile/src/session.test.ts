import { describe, expect, it } from "vitest";
import {
  applyAuthCallbackUrl,
  AUTH_TOKEN_STORAGE_KEY,
  importTokenFromInitialUrl,
  magicTokenFromCallbackUrl,
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

describe("magicTokenFromCallbackUrl", () => {
  it("extracts the magic token from an API or web verification link", () => {
    expect(
      magicTokenFromCallbackUrl("https://put-away.com/auth/verify?token=magic123"),
    ).toBe("magic123");
    expect(
      magicTokenFromCallbackUrl("putaway://auth/verify?token=magic-app"),
    ).toBe("magic-app");
    expect(magicTokenFromCallbackUrl("putaway:///?token=magic456")).toBe("magic456");
  });

  it("returns null when the URL has no token param", () => {
    expect(magicTokenFromCallbackUrl("putaway://talk")).toBeNull();
  });
});

describe("applyAuthCallbackUrl", () => {
  it("exchanges a magic token and stores the returned bearer token", async () => {
    const storage = fakeStorage();
    const token = await applyAuthCallbackUrl(
      "https://put-away.com/auth/verify?token=magic123",
      storage,
      async (magicToken) => {
        expect(magicToken).toBe("magic123");
        return { token: "bearer123", user: { id: "user-1", email: "person@example.com" } };
      },
    );
    expect(token).toBe("bearer123");
    expect(storage.data[AUTH_TOKEN_STORAGE_KEY]).toBe("bearer123");
  });

  it("does not verify or write storage when the URL has no token param", async () => {
    const storage = fakeStorage();
    let verified = false;
    const token = await applyAuthCallbackUrl("putaway://talk", storage, async () => {
      verified = true;
      return { token: "unused", user: { id: "unused", email: "unused@example.com" } };
    });
    expect(token).toBeNull();
    expect(verified).toBe(false);
    expect(storage.data[AUTH_TOKEN_STORAGE_KEY]).toBeUndefined();
  });

  it("imports a bearer token from Linking.getInitialURL on cold start", async () => {
    const storage = fakeStorage();
    const getInitialURL = async () => "putaway:///?token=magic123";
    const token = await importTokenFromInitialUrl(getInitialURL, storage, async () => ({
      token: "bearer123",
      user: { id: "user-1", email: "person@example.com" },
    }));
    expect(token).toBe("bearer123");
  });
});
