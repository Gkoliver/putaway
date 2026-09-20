import { afterEach, describe, expect, it, vi } from "vitest";
import { requestMagicLink, signOut, verifyMagicLink } from "./auth";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PHP API authentication", () => {
  it("requests a magic link with the email address", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await requestMagicLink("https://put-away.com", "person@example.com");

    expect(fetchMock).toHaveBeenCalledWith("https://put-away.com/api/auth/magic-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "person@example.com" }),
    });
  });

  it("exchanges a magic-link token for a bearer token", async () => {
    const payload = {
      token: "bearer-token",
      user: { id: "user-1", email: "person@example.com" },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyMagicLink("https://put-away.com", "magic token")).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://put-away.com/api/auth/verify?token=magic%20token",
    );
  });

  it("signs out with the bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await signOut("https://put-away.com", "bearer-token");

    expect(fetchMock).toHaveBeenCalledWith("https://put-away.com/api/auth/sign-out", {
      method: "POST",
      headers: { authorization: "Bearer bearer-token" },
    });
  });

  it("throws when an auth endpoint rejects the request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"error":"invalid_email"}', {
      status: 400,
    })));

    await expect(requestMagicLink("https://put-away.com", "invalid")).rejects.toMatchObject({
      status: 400,
    });
  });
});
