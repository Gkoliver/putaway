import { getOpenAiClient } from "./client";

async function toAudioFile(audio: Blob | Buffer | ArrayBuffer): Promise<File> {
  if (audio instanceof Blob) {
    return new File([audio], "audio.webm", { type: audio.type || "audio/webm" });
  }
  const buffer = audio instanceof Buffer ? audio : Buffer.from(audio);
  return new File([buffer], "audio.webm", { type: "audio/webm" });
}

export async function transcribe(audio: Blob | Buffer | ArrayBuffer): Promise<string> {
  const openai = getOpenAiClient();
  const file = await toAudioFile(audio);
  const result = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file,
  });
  return result.text;
}
