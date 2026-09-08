import type { CommandOutcome, InventoryCommand } from "@putaway/shared";

async function parseCommandResponse(res: Response): Promise<CommandOutcome> {
  if (!res.ok) {
    const error = new Error("Something went wrong. Try again.") as Error & { status: number };
    error.status = res.status;
    throw error;
  }
  return (await res.json()) as CommandOutcome;
}

export async function submitCommand(input: {
  apiBase: string;
  token: string;
  householdId: string;
  clientCommandId: string;
  transcript?: string;
  command?: InventoryCommand;
}): Promise<CommandOutcome> {
  const res = await fetch(`${input.apiBase}/api/commands`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.token}`,
    },
    body: JSON.stringify({
      householdId: input.householdId,
      clientCommandId: input.clientCommandId,
      transcript: input.transcript,
      command: input.command,
    }),
  });
  return parseCommandResponse(res);
}

export async function submitAudio(input: {
  apiBase: string;
  token: string;
  householdId: string;
  clientCommandId: string;
  audioUri: string;
}): Promise<CommandOutcome> {
  const form = new FormData();
  form.append("householdId", input.householdId);
  form.append("clientCommandId", input.clientCommandId);
  form.append(
    "audio",
    {
      uri: input.audioUri,
      name: "clip.m4a",
      type: "audio/mp4",
    } as unknown as Blob,
  );
  const res = await fetch(`${input.apiBase}/api/commands`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.token}`,
    },
    body: form,
  });
  return parseCommandResponse(res);
}

export type HouseholdRow = {
  householdId: string;
  name: string;
  role: "owner" | "member";
};

export type InventoryRow = {
  itemId: string;
  itemName: string;
  locationId: string;
  pathLabel: string;
  quantity: number;
};

export async function fetchHouseholds(input: {
  apiBase: string;
  token: string;
}): Promise<HouseholdRow[]> {
  const res = await fetch(`${input.apiBase}/api/households`, {
    headers: { authorization: `Bearer ${input.token}` },
  });
  return (await res.json()) as HouseholdRow[];
}

export async function createHousehold(input: {
  apiBase: string;
  token: string;
  name: string;
}): Promise<{ householdId: string; role: "owner" }> {
  const res = await fetch(`${input.apiBase}/api/households`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.token}`,
    },
    body: JSON.stringify({ name: input.name }),
  });
  return (await res.json()) as { householdId: string; role: "owner" };
}

export async function fetchInventory(input: {
  apiBase: string;
  token: string;
  householdId: string;
}): Promise<InventoryRow[]> {
  const res = await fetch(`${input.apiBase}/api/households/${input.householdId}/inventory`, {
    headers: { authorization: `Bearer ${input.token}` },
  });
  if (!res.ok) {
    const error = new Error(
      res.status === 401 || res.status === 403
        ? "Pick a household first."
        : "Could not load inventory.",
    ) as Error & { status: number };
    error.status = res.status;
    throw error;
  }
  return (await res.json()) as InventoryRow[];
}
