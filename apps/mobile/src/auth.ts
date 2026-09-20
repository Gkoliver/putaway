export const apiBase = process.env.EXPO_PUBLIC_API_BASE ?? "https://put-away.com";

export type VerifiedAuth = {
  token: string;
  user: {
    id: string;
    email: string;
  };
};

type AuthError = Error & { status: number };

function authError(message: string, status: number): AuthError {
  const error = new Error(message) as AuthError;
  error.status = status;
  return error;
}

export async function requestMagicLink(baseUrl: string, email: string): Promise<void> {
  const res = await fetch(`${baseUrl}/api/auth/magic-link`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw authError("Could not send sign-in link.", res.status);
}

export async function verifyMagicLink(
  baseUrl: string,
  magicToken: string,
): Promise<VerifiedAuth> {
  const res = await fetch(
    `${baseUrl}/api/auth/verify?token=${encodeURIComponent(magicToken)}`,
  );
  if (!res.ok) throw authError("Sign-in link is invalid or expired.", res.status);
  return (await res.json()) as VerifiedAuth;
}

export async function signOut(baseUrl: string, token: string): Promise<void> {
  const res = await fetch(`${baseUrl}/api/auth/sign-out`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 401) {
    throw authError("Could not sign out.", res.status);
  }
}
