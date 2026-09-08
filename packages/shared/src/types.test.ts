import { describe, expect, it } from "vitest";
import { INTENTS, defaultQuantity, isIntent } from "./types";

describe("shared command types", () => {
  it("lists the four v1 intents", () => {
    expect([...INTENTS].sort()).toEqual(
      ["find", "find_usual", "put_away", "take_out"].sort(),
    );
  });

  it("defaults quantity to 1", () => {
    expect(defaultQuantity).toBe(1);
  });

  it("rejects unknown intents", () => {
    expect(isIntent("put_away")).toBe(true);
    expect(isIntent("delete_everything")).toBe(false);
  });
});
