import { describe, expect, it } from "vitest";
import { createTalkLock } from "./talkLock";

describe("createTalkLock", () => {
  it("rejects a second hold start while already holding", () => {
    const lock = createTalkLock();
    expect(lock.startHold()).toBe(true);
    expect(lock.startHold()).toBe(false);
  });

  it("locks text and clarification mutations while holding", () => {
    const lock = createTalkLock();
    lock.startHold();
    expect(lock.mutationsLocked).toBe(true);
    expect(lock.tryStartMutation()).toBe(false);
    expect(lock.holdControlDisabled).toBe(false);
  });

  it("allows a new hold after the previous hold ends", () => {
    const lock = createTalkLock();
    expect(lock.startHold()).toBe(true);
    lock.release();
    expect(lock.mutationsLocked).toBe(false);
    expect(lock.startHold()).toBe(true);
  });
});
