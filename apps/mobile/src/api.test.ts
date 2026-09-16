import { afterEach, describe, expect, it, vi } from "vitest";
import { createHousehold, fetchHouseholds, submitAudio, submitCommand } from "./api";

describe("submitCommand", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws on non-OK response instead of returning a fake outcome", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ type: "ok", spoken: "fake success" }),
      }),
    );

    await expect(
      submitCommand({
        apiBase: "https://example.test",
        token: "token",
        householdId: "hh-1",
        clientCommandId: "cmd-1",
        transcript: "find batteries",
      }),
    ).rejects.toThrow("Something went wrong. Try again.");
  });
});

describe("fetchHouseholds", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws on non-OK response instead of returning a fake list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => [{ householdId: "hh-1", name: "Fake", role: "owner" }],
      }),
    );

    await expect(
      fetchHouseholds({ apiBase: "https://example.test", token: "token" }),
    ).rejects.toThrow("Could not load households.");
  });
});

describe("submitAudio", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the recording as a real audio blob", async () => {
    const blob = new Blob(["audio-bytes"], { type: "audio/mp4" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => blob,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ type: "ok", spoken: "Put away paper towels." }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await submitAudio({
      apiBase: "https://example.test",
      token: "token",
      householdId: "hh-1",
      clientCommandId: "cmd-1",
      audioUri: "file:///tmp/clip.m4a",
    });

    expect(outcome).toMatchObject({ type: "ok" });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "file:///tmp/clip.m4a");
    const posted = fetchMock.mock.calls[1][1] as { body: FormData };
    expect(posted.body.get("householdId")).toBe("hh-1");
    expect(posted.body.get("audio")).toBeTruthy();
  });
});

describe("createHousehold", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws on non-OK response instead of returning a fake household", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ householdId: "hh-fake", role: "owner" }),
      }),
    );

    await expect(
      createHousehold({ apiBase: "https://example.test", token: "token", name: "Home" }),
    ).rejects.toThrow("Could not create household.");
  });
});
