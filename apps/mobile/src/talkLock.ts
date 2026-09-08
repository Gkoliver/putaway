export type TalkLockPhase = "idle" | "holding" | "uploading";

export function createTalkLock() {
  let phase: TalkLockPhase = "idle";

  return {
    get phase() {
      return phase;
    },
    get mutationsLocked() {
      return phase !== "idle";
    },
    get holdControlDisabled() {
      return phase === "uploading";
    },
    startHold(): boolean {
      if (phase !== "idle") return false;
      phase = "holding";
      return true;
    },
    beginUploadFromHold(): boolean {
      if (phase !== "holding") return false;
      phase = "uploading";
      return true;
    },
    tryStartMutation(): boolean {
      if (phase !== "idle") return false;
      phase = "uploading";
      return true;
    },
    release(): void {
      phase = "idle";
    },
  };
}
