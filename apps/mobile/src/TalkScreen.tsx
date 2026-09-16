import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import { randomUUID } from "expo-crypto";
import type { CommandOutcome, InventoryCommand } from "@putaway/shared";
import { isPutAwayBatchCommand } from "@putaway/shared";
import { submitAudio, submitCommand } from "./api";
import { ClarificationPicker } from "./ClarificationPicker";
import { useSession } from "./session";
import { createTalkLock } from "./talkLock";
import { colors, theme } from "./theme";

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
    } catch (error) {
      setOutcome({
        type: "error",
        code: "not_caught",
        spoken: error instanceof Error ? error.message : REQUEST_ERROR.spoken,
      });
    } finally {
      lockRef.current.release();
      syncLock();
    }
  }

  async function sendTranscript(text: string) {
    if (!token || !activeHouseholdId) {
      setOutcome({
        type: "error",
        code: "not_caught",
        spoken: "Sign in and create a household first.",
      });
      return;
    }
    if (!lockRef.current.tryStartMutation()) {
      setOutcome({
        type: "error",
        code: "not_caught",
        spoken: "Still finishing the last request. Wait a moment, then Send again.",
      });
      return;
    }
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
    } catch (error) {
      setOutcome({
        type: "error",
        code: "not_caught",
        spoken: error instanceof Error ? error.message : REQUEST_ERROR.spoken,
      });
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
      lockRef.current.release();
      syncLock();
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
    } catch (error) {
      setOutcome({
        type: "error",
        code: "not_caught",
        spoken: error instanceof Error ? error.message : REQUEST_ERROR.spoken,
      });
    } finally {
      lockRef.current.release();
      syncLock();
    }
  }

  const clarification = outcome?.type === "clarification" ? outcome.clarification : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={theme.content}
      keyboardShouldPersistTaps="handled"
    >
      {!token ? <Text style={theme.body}>Sign in from the Household tab.</Text> : null}
      {token && !activeHouseholdId ? (
        <Text style={theme.body}>
          No household yet. Open the Household tab, type a name like Home, tap Create household,
          then come back here to put items away.
        </Text>
      ) : null}
      <Pressable
        accessibilityLabel="Hold to talk"
        disabled={holdControlDisabled}
        onPressIn={() => void onHoldStart()}
        onPressOut={() => void onHoldEnd()}
        style={[theme.primaryButton, holdControlDisabled && theme.primaryButtonDisabled]}
      >
        <Text style={theme.primaryButtonText}>{recording ? "Listening…" : "Hold to talk"}</Text>
      </Pressable>
      {outcome?.type === "ok" ? (
        <View accessibilityLabel="confirmation" style={[theme.card, theme.cardBody]}>
          <Text style={theme.body}>{outcome.spoken}</Text>
        </View>
      ) : null}
      {outcome?.type === "error" ? <Text style={theme.error}>{outcome.spoken}</Text> : null}
      {clarification ? (
        <View style={{ gap: 12 }}>
          {outcome?.type === "clarification" ? (
            <Text style={theme.body}>{outcome.spoken}</Text>
          ) : null}
          <ClarificationPicker
            clarification={clarification}
            disabled={mutationsLocked}
            onChooseLocation={(locationId) => {
              if (lockRef.current.mutationsLocked) return;
              const base = pendingCommand.current;
              if (!base || isPutAwayBatchCommand(base)) {
                setOutcome(RESUBMIT_ERROR);
                return;
              }
              void sendCommand({ ...base, locationId });
            }}
            onChooseItem={(itemId) => {
              if (lockRef.current.mutationsLocked) return;
              const base = pendingCommand.current;
              if (!base || isPutAwayBatchCommand(base)) {
                setOutcome(RESUBMIT_ERROR);
                return;
              }
              void sendCommand({ ...base, itemId });
            }}
            onConfirmBatch={(items) => {
              if (lockRef.current.mutationsLocked) return;
              const base = pendingCommand.current;
              if (!base || !isPutAwayBatchCommand(base)) {
                setOutcome(RESUBMIT_ERROR);
                return;
              }
              void sendCommand({ ...base, items, confirmed: true });
            }}
          />
        </View>
      ) : null}
      {showText ? (
        <View style={talkStyles.compose}>
          <TextInput
            accessibilityLabel="transcript"
            placeholder="Type a command"
            placeholderTextColor={colors.label}
            value={transcript}
            onChangeText={setTranscript}
            multiline
            style={[theme.input, talkStyles.transcriptInput]}
          />
          <Pressable
            disabled={mutationsLocked}
            onPress={() => void sendTranscript(transcript)}
            style={[theme.primaryButton, mutationsLocked && theme.primaryButtonDisabled]}
          >
            <Text style={theme.primaryButtonText}>Send</Text>
          </Pressable>
        </View>
      ) : null}
      {busy ? <Text style={theme.caption}>Working…</Text> : null}
    </ScrollView>
  );
}

const talkStyles = StyleSheet.create({
  compose: {
    gap: 12,
  },
  transcriptInput: {
    minHeight: 88,
    textAlignVertical: "top",
  },
});
