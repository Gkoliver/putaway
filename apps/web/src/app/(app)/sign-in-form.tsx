"use client";

import { useState, type FormEvent } from "react";

export function SignInForm({ callbackURL = "/inventory" }: { callbackURL?: string }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    const res = await fetch("/api/auth/sign-in/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, callbackURL }),
    });
    if (!res.ok) {
      setError("Could not send sign-in link.");
      return;
    }
    setSent(true);
  }

  if (sent) return <p>Check your email for a sign-in link.</p>;

  return (
    <form onSubmit={onSubmit}>
      <label htmlFor="sign-in-email">Email</label>
      <input id="sign-in-email" name="email" type="email" required />
      <button type="submit">Send sign-in link</button>
      {error ? <p>{error}</p> : null}
    </form>
  );
}
