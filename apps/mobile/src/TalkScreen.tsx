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
  const busyRef = useRef(false);
  const [outcome, setOutcome] = useState<CommandOutcome | null>(null);
  const [showText, setShowText] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);

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

  function beginBusy() {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    return true;
  }

  function endBusy() {
    busyRef.current = false;
    setBusy(false);
  }

  async function sendCommand(command: InventoryCommand) {
    if (!token || !activeHouseholdId || !beginBusy()) return;
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
      endBusy();
    }
  }

  async function sendTranscript(text: string) {
    if (!token || !activeHouseholdId || !beginBusy()) return;
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
      endBusy();
    }
  }

  async function onHoldStart() {
    if (busyRef.current) return;
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
      setShowText(true);
      return;
    }
    preparePromiseRef.current = null;
    try {
      await recorder.stop();
    } catch {
      setShowText(true);
      return;
    }
    const uri = recorder.uri;
    if (!uri || !token || !activeHouseholdId) {
      setShowText(true);
      return;
    }
    if (!beginBusy()) return;
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
      endBusy();
    }
  }

  const clarification = outcome?.type === "clarification" ? outcome.clarification : null;

  return (
    <View>
      {!token ? <Text>Sign in from the Household tab.</Text> : null}
      {token && !activeHouseholdId ? <Text>Pick a household first.</Text> : null}
      <Pressable
        accessibilityLabel="Hold to talk"
        disabled={busy}
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
          disabled={busy}
          onChooseLocation={(locationId) => {
            if (busyRef.current) return;
            const base = pendingCommand.current;
            if (!base) {
              setOutcome(RESUBMIT_ERROR);
              return;
            }
            void sendCommand({ ...base, locationId });
          }}
          onChooseItem={(itemId) => {
            if (busyRef.current) return;
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
          <Pressable disabled={busy} onPress={() => void sendTranscript(transcript)}>
            <Text>Send</Text>
          </Pressable>
        </View>
      ) : null}
      {busy ? <Text>Working…</Text> : null}
    </View>
  );
}
