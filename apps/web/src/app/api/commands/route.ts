import {
  interpretTranscript,
  isPutAwayBatchCommand,
  pathLabelFromSegments,
  type CommandOutcome,
  type InventoryCommand,
} from "@putaway/shared";
import { getDb, type Database } from "../../../lib/db/client";
import { requireMembership } from "../../../lib/households";
import { handleCommand } from "../../../lib/inventory/handler";
import { withCommandReceipt } from "../../../lib/inventory/receipts";
import { extract } from "../../../lib/openai/extract";
import { transcribe } from "../../../lib/openai/transcribe";

const VOICE_UNAVAILABLE_SPOKEN = "Voice is unavailable — type it instead.";

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
  const membership = await requireMembership(db, userId, payload.householdId);
  if (!membership) {
    return Response.json(
      { type: "error", code: "forbidden", spoken: "You don't have access to that household." },
      { status: 403 },
    );
  }

  const outcome = await withCommandReceipt(db, {
    householdId: payload.householdId,
    userId,
    clientCommandId: payload.clientCommandId,
    run: async (tx) => {
      let command = payload.command;
      let transcript = payload.transcript;

      if (!command && payload.audio) {
        try {
          transcript = await transcribe(payload.audio);
        } catch {
          return {
            type: "error",
            code: "voice_unavailable",
            spoken: VOICE_UNAVAILABLE_SPOKEN,
          } as const;
        }
      }

      if (!command && transcript !== undefined) {
        const interpreted = await interpretTranscript(transcript, extract);
        if ("intent" in interpreted) {
          command = interpreted;
        } else if ("type" in interpreted && interpreted.type === "follow_up") {
          return {
            type: "clarification",
            spoken: interpreted.message,
            clarification: { type: "follow_up", message: interpreted.message },
          };
        } else if ("type" in interpreted && interpreted.type === "error") {
          return interpreted;
        }
      }

      if (!command) {
        return {
          type: "error",
          code: "not_caught",
          spoken: "I didn't catch that.",
        };
      }

      if (isPutAwayBatchCommand(command) && !command.confirmed) {
        if (!command.locationPath.length || command.items.length < 2) {
          return {
            type: "error",
            code: "not_caught",
            spoken: "I didn't catch that.",
          };
        }
        const pathLabel = pathLabelFromSegments(command.locationPath);
        return {
          type: "clarification",
          spoken: `Add ${command.items.length} items to ${pathLabel}?`,
          clarification: {
            type: "confirm_batch",
            locationPath: command.locationPath,
            pathLabel,
            items: command.items,
          },
          command,
        };
      }

      const result = await handleCommand(tx, {
        userId,
        householdId: payload.householdId,
        command,
      });
      if (result.type === "clarification") {
        return { ...result, command };
      }
      return result;
    },
  });

  if (outcome.type === "error" && outcome.code === "forbidden") {
    return Response.json(outcome, { status: 403 });
  }
  return jsonOutcome(outcome);
}

async function realGetUserId(req: Request): Promise<string | null> {
  const { getUserIdFromRequest } = await import("../../../lib/auth");
  return getUserIdFromRequest(req);
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
