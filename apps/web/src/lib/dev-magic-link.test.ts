import { afterEach, describe, expect, it } from "vitest";
import {
  clearDevMagicLink,
  devMagicLinkResponse,
  rememberDevMagicLink,
} from "./dev-magic-link";

describe("dev magic link", () => {
  afterEach(() => {
    clearDevMagicLink();
  });

  it("returns the last remembered url outside production", async () => {
    rememberDevMagicLink("http://localhost:3000/api/auth/magic-link/verify?token=abc");
    const res = devMagicLinkResponse("development");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: "http://localhost:3000/api/auth/magic-link/verify?token=abc",
    });
  });

  it("returns 404 in production", async () => {
    rememberDevMagicLink("http://localhost:3000/secret");
    const res = devMagicLinkResponse("production");
    expect(res.status).toBe(404);
  });
});
