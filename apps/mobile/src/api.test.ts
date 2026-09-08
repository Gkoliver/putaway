import { afterEach, describe, expect, it, vi } from "vitest";
import { submitCommand } from "./api";

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
