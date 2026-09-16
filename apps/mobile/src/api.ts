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
  const fileRes = await fetch(input.audioUri);
  if (!fileRes.ok) {
    throw new Error("Could not read the recording.");
  }
  const blob = await fileRes.blob();
  const form = new FormData();
  form.append("householdId", input.householdId);
  form.append("clientCommandId", input.clientCommandId);
  form.append("audio", blob, "clip.m4a");
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
  if (!res.ok) {
    const error = new Error("Could not load households.") as Error & { status: number };
    error.status = res.status;
    throw error;
  }
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
  if (!res.ok) {
    const error = new Error("Could not create household.") as Error & { status: number };
    error.status = res.status;
    throw error;
  }
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

export async function editInventory(input: {
  apiBase: string;
  token: string;
  householdId: string;
  itemId: string;
  locationId: string;
  name: string;
  quantity: number;
  locationPath: string[];
}): Promise<{ ok: true } | { ok: false; spoken: string }> {
  const res = await fetch(`${input.apiBase}/api/households/${input.householdId}/inventory`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.token}`,
    },
    body: JSON.stringify({
      itemId: input.itemId,
      locationId: input.locationId,
      name: input.name,
      quantity: input.quantity,
      locationPath: input.locationPath,
    }),
  });
  if (!res.ok) {
    try {
      const body = (await res.json()) as { spoken?: string };
      return { ok: false, spoken: body.spoken ?? "Could not save." };
    } catch {
      return { ok: false, spoken: "Could not save." };
    }
  }
  return { ok: true };
}

export type LocationRow = {
  id: string;
  parentId: string | null;
  name: string;
  pathLabel: string;
};

async function locationWriteError(res: Response): Promise<{ ok: false; spoken: string }> {
  try {
    const body = (await res.json()) as { spoken?: string };
    return { ok: false, spoken: body.spoken ?? "Could not save." };
  } catch {
    return { ok: false, spoken: "Could not save." };
  }
}

export async function fetchLocations(input: {
  apiBase: string;
  token: string;
  householdId: string;
}): Promise<LocationRow[]> {
  const res = await fetch(`${input.apiBase}/api/households/${input.householdId}/locations`, {
    headers: { authorization: `Bearer ${input.token}` },
  });
  if (!res.ok) {
    const error = new Error(
      res.status === 401 || res.status === 403
        ? "Pick a household first."
        : "Could not load places.",
    ) as Error & { status: number };
    error.status = res.status;
    throw error;
  }
  return (await res.json()) as LocationRow[];
}

export async function createLocation(input: {
  apiBase: string;
  token: string;
  householdId: string;
  name: string;
  parentId: string | null;
}): Promise<{ ok: true; locationId: string; pathLabel: string } | { ok: false; spoken: string }> {
  const res = await fetch(`${input.apiBase}/api/households/${input.householdId}/locations`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.token}`,
    },
    body: JSON.stringify({ name: input.name, parentId: input.parentId }),
  });
  if (!res.ok) return locationWriteError(res);
  return (await res.json()) as { ok: true; locationId: string; pathLabel: string };
}

export async function updateLocation(input: {
  apiBase: string;
  token: string;
  householdId: string;
  locationId: string;
  name?: string;
  parentId?: string | null;
}): Promise<{ ok: true } | { ok: false; spoken: string }> {
  const body: { locationId: string; name?: string; parentId?: string | null } = {
    locationId: input.locationId,
  };
  if (input.name !== undefined) body.name = input.name;
  if (input.parentId !== undefined) body.parentId = input.parentId;
  const res = await fetch(`${input.apiBase}/api/households/${input.householdId}/locations`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return locationWriteError(res);
  return { ok: true };
}
