"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function TryCommandForm({ householdId }: { householdId: string }) {
  const router = useRouter();
  const [spoken, setSpoken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSpoken(null);
    const form = new FormData(event.currentTarget);
    const itemText = String(form.get("itemText") ?? "").trim();
    const locationText = String(form.get("locationPath") ?? "").trim();
    const intent = String(form.get("intent") ?? "put_away");
    const locationPath = locationText
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);

    const res = await fetch("/api/commands", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        householdId,
        clientCommandId: crypto.randomUUID(),
        command: {
          intent,
          itemText,
          quantity: 1,
          locationPath: locationPath.length ? locationPath : undefined,
        },
      }),
    });
    const outcome = (await res.json()) as { type: string; spoken?: string };
    if (!res.ok || outcome.type === "error") {
      setError(outcome.spoken ?? "Could not run that command.");
      return;
    }
    setSpoken(outcome.spoken ?? "Done.");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      <h2>Try a command</h2>
      <label htmlFor="intent">Intent</label>
      <select id="intent" name="intent" defaultValue="put_away">
        <option value="put_away">put away</option>
        <option value="find">find</option>
        <option value="take_out">take out</option>
        <option value="find_usual">usual place</option>
      </select>
      <label htmlFor="itemText">Item</label>
      <input id="itemText" name="itemText" required placeholder="paper towels" />
      <label htmlFor="locationPath">Location (for put away)</label>
      <input
        id="locationPath"
        name="locationPath"
        placeholder="basement / metal shelves / shelf A"
      />
      <button type="submit">Run</button>
      {spoken ? <p>{spoken}</p> : null}
      {error ? <p>{error}</p> : null}
    </form>
  );
}
