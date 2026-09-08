import {
  interpretTranscript,
  isIntent,
  type CommandOutcome,
  type InventoryCommand,
} from "@putaway/shared";
import { getDb, type Database } from "../../../lib/db/client";
import { handleCommand } from "../../../lib/inventory/handler";
import { withCommandReceipt } from "../../../lib/inventory/receipts";
import { extract } from "../../../lib/openai/extract";
import { transcribe } from "../../../lib/openai/transcribe";

export type CommandsPostDeps = {
  db: Database;
  getUserId: (req: Request) => Promise<string | null>;
};

type CommandPayload = {
  householdId: string;
  clientCommandId: string;
  transcript?: string;
  command?: InventoryCommand;
  audio?: Blob;
};

export async function handleCommandsPost(
  req: Request,
  { db, getUserId }: CommandsPostDeps,
): Promise<Response> {
  const userId = await getUserId(req);
  if (!userId) {
    return Response.json(
      { type: "error", code: "forbidden", spoken: "Sign in required." },
      { status: 401 },
    );
  }

  const payload = await readPayload(req);
  let command = payload.command;
  let transcript = payload.transcript;

  if (!command && payload.audio) {
    transcript = await transcribe(payload.audio);
  }

  if (!command && transcript !== undefined) {
    const interpreted = await interpretTranscript(transcript, extract);
    if ("intent" in interpreted && isIntent(interpreted.intent)) {
      command = interpreted;
    } else if ("type" in interpreted && interpreted.type === "follow_up") {
      return jsonOutcome({
        type: "clarification",
        spoken: interpreted.message,
        clarification: { type: "follow_up", message: interpreted.message },
      });
    } else if ("type" in interpreted && interpreted.type === "error") {
      return jsonOutcome(interpreted);
    }
  }

  if (!command) {
    return jsonOutcome({
      type: "error",
      code: "not_caught",
      spoken: "I didn't catch that.",
    });
  }

  const outcome = await withCommandReceipt(db, {
    householdId: payload.householdId,
    userId,
    clientCommandId: payload.clientCommandId,
    run: () =>
      handleCommand(db, {
        userId,
        householdId: payload.householdId,
        command,
      }),
  });

  if (outcome.type === "error" && outcome.code === "forbidden") {
    return Response.json(outcome, { status: 403 });
  }
  return jsonOutcome(outcome);
}

async function realGetUserId(_req: Request): Promise<string | null> {
  return null;
}

export async function POST(req: Request): Promise<Response> {
  return handleCommandsPost(req, { db: getDb(), getUserId: realGetUserId });
}

async function readPayload(req: Request): Promise<CommandPayload> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const commandRaw = form.get("command");
    const transcriptRaw = form.get("transcript");
    const audio = form.get("audio");
    return {
      householdId: String(form.get("householdId") ?? ""),
      clientCommandId: String(form.get("clientCommandId") ?? ""),
      transcript: typeof transcriptRaw === "string" ? transcriptRaw : undefined,
      command:
        typeof commandRaw === "string" && commandRaw
          ? (JSON.parse(commandRaw) as InventoryCommand)
          : undefined,
      audio: audio instanceof Blob ? audio : undefined,
    };
  }

  const json = (await req.json()) as CommandPayload;
  return {
    householdId: json.householdId,
    clientCommandId: json.clientCommandId,
    transcript: json.transcript,
    command: json.command,
  };
}

function jsonOutcome(outcome: CommandOutcome): Response {
  return Response.json(outcome, { status: 200 });
}
