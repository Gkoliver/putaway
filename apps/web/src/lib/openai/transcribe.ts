import { getOpenAiClient } from "./client";

async function toAudioFile(audio: Blob | Buffer | ArrayBuffer): Promise<File> {
  if (audio instanceof Blob) {
    return new File([audio], "audio.webm", { type: audio.type || "audio/webm" });
  }
  const source =
    audio instanceof Buffer
      ? new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength)
      : new Uint8Array(audio);
  // Copy into a plain ArrayBuffer so File's BlobPart typing accepts it.
  const bytes = new Uint8Array(source.byteLength);
  bytes.set(source);
  return new File([bytes], "audio.webm", { type: "audio/webm" });
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
