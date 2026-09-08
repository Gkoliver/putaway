import { useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import { randomUUID } from "expo-crypto";
import type { CommandOutcome, InventoryCommand } from "@putaway/shared";
import { submitAudio, submitCommand } from "./api";
import { ClarificationPicker } from "./ClarificationPicker";
import { useSession } from "./session";
import { createTalkLock } from "./talkLock";

const RESUBMIT_ERROR: CommandOutcome = {
  type: "error",
  code: "not_caught",
  spoken: "Could not apply that choice. Try again.",
};

const REQUEST_ERROR: CommandOutcome = {
  type: "error",
  code: "not_caught",
  spoken: "Something went wrong. Try again.",
};

export function TalkScreen() {
  const { apiBase, token, activeHouseholdId } = useSession();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const pendingCommand = useRef<InventoryCommand | null>(null);
  const holdActiveRef = useRef(false);
  const preparePromiseRef = useRef<Promise<void> | null>(null);
  const lockRef = useRef(createTalkLock());
  const [outcome, setOutcome] = useState<CommandOutcome | null>(null);
  const [showText, setShowText] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [talkPhase, setTalkPhase] = useState(lockRef.current.phase);
  const [recording, setRecording] = useState(false);
  const mutationsLocked = talkPhase !== "idle";
  const holdControlDisabled = talkPhase === "uploading";
  const busy = talkPhase === "uploading";

  useEffect(() => {
    void (async () => {
      try {
        const status = await AudioModule.requestRecordingPermissionsAsync();
        if (!status.granted) setShowText(true);
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      } catch {
        setShowText(true);
      }
    })();
  }, []);

  function applyOutcome(next: CommandOutcome, command?: InventoryCommand) {
    setOutcome(next);
    if (next.type === "clarification" && next.command) pendingCommand.current = next.command;
    else if (command) pendingCommand.current = command;
    if (next.type === "ok") pendingCommand.current = null;
    if (next.type === "error" && (next.code === "voice_unavailable" || next.code === "empty_transcript")) {
      setShowText(true);
    }
    if (next.type === "clarification" && next.clarification.type === "follow_up") {
      setShowText(true);
    }
  }

  function syncLock() {
    setTalkPhase(lockRef.current.phase);
  }

  async function sendCommand(command: InventoryCommand) {
    if (!token || !activeHouseholdId || !lockRef.current.tryStartMutation()) return;
    syncLock();
    try {
      pendingCommand.current = command;
      const next = await submitCommand({
        apiBase,
        token,
        householdId: activeHouseholdId,
        clientCommandId: randomUUID(),
        command,
      });
      applyOutcome(next, command);
    } catch {
      setOutcome(REQUEST_ERROR);
    } finally {
      lockRef.current.release();
      syncLock();
    }
  }

  async function sendTranscript(text: string) {
    if (!token || !activeHouseholdId || !lockRef.current.tryStartMutation()) return;
    syncLock();
    try {
      const next = await submitCommand({
        apiBase,
        token,
        householdId: activeHouseholdId,
        clientCommandId: randomUUID(),
        transcript: text,
      });
      applyOutcome(next);
    } catch {
      setOutcome(REQUEST_ERROR);
    } finally {
      lockRef.current.release();
      syncLock();
    }
  }

  async function onHoldStart() {
    if (!lockRef.current.startHold()) return;
    syncLock();
    holdActiveRef.current = true;
    const prepare = recorder.prepareToRecordAsync().then(() => {
      recorder.record();
    });
    preparePromiseRef.current = prepare;
    try {
      await prepare;
      if (holdActiveRef.current) setRecording(true);
    } catch {
      holdActiveRef.current = false;
      setShowText(true);
    }
  }

  async function onHoldEnd() {
    if (!holdActiveRef.current && !preparePromiseRef.current) return;
    holdActiveRef.current = false;
    setRecording(false);
    try {
      if (preparePromiseRef.current) await preparePromiseRef.current;
    } catch {
      preparePromiseRef.current = null;
      lockRef.current.release();
      syncLock();
      setShowText(true);
      return;
    }
    preparePromiseRef.current = null;
    try {
      await recorder.stop();
    } catch {
      lockRef.current.release();
      syncLock();
      setShowText(true);
      return;
    }
    const uri = recorder.uri;
    if (!uri || !token || !activeHouseholdId) {
      lockRef.current.release();
      syncLock();
      setShowText(true);
      return;
    }
    if (!lockRef.current.beginUploadFromHold()) {
      lockRef.current.release();
      syncLock();
      return;
    }
    syncLock();
    try {
      const next = await submitAudio({
        apiBase,
        token,
        householdId: activeHouseholdId,
        clientCommandId: randomUUID(),
        audioUri: uri,
      });
      applyOutcome(next);
    } catch {
      setOutcome(REQUEST_ERROR);
    } finally {
      lockRef.current.release();
      syncLock();
    }
  }

  const clarification = outcome?.type === "clarification" ? outcome.clarification : null;

  return (
    <View>
      {!token ? <Text>Sign in from the Household tab.</Text> : null}
      {token && !activeHouseholdId ? <Text>Pick a household first.</Text> : null}
      <Pressable
        accessibilityLabel="Hold to talk"
        disabled={holdControlDisabled}
        onPressIn={() => void onHoldStart()}
        onPressOut={() => void onHoldEnd()}
      >
        <Text>{recording ? "Listening…" : "Hold to talk"}</Text>
      </Pressable>
      {outcome?.type === "ok" ? (
        <View accessibilityLabel="confirmation">
          <Text>{outcome.spoken}</Text>
        </View>
      ) : null}
      {outcome?.type === "error" ? <Text>{outcome.spoken}</Text> : null}
      {clarification ? (
        <ClarificationPicker
          clarification={clarification}
          disabled={mutationsLocked}
          onChooseLocation={(locationId) => {
            if (lockRef.current.mutationsLocked) return;
            const base = pendingCommand.current;
            if (!base) {
              setOutcome(RESUBMIT_ERROR);
              return;
            }
            void sendCommand({ ...base, locationId });
          }}
          onChooseItem={(itemId) => {
            if (lockRef.current.mutationsLocked) return;
            const base = pendingCommand.current;
            if (!base) {
              setOutcome(RESUBMIT_ERROR);
              return;
            }
            void sendCommand({ ...base, itemId });
          }}
        />
      ) : null}
      {showText ? (
        <View>
          <TextInput
            accessibilityLabel="transcript"
            placeholder="Type a command"
            value={transcript}
            onChangeText={setTranscript}
          />
          <Pressable disabled={mutationsLocked} onPress={() => void sendTranscript(transcript)}>
            <Text>Send</Text>
          </Pressable>
        </View>
      ) : null}
      {busy ? <Text>Working…</Text> : null}
    </View>
  );
}
