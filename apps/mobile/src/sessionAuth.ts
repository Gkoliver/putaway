import { apiBase, verifyMagicLink, type VerifiedAuth } from "./auth";

export const AUTH_TOKEN_STORAGE_KEY = "putaway.bearerToken";

export type AuthTokenStorage = {
  setItemAsync: (key: string, value: string) => Promise<void>;
};

type VerifyMagicToken = (token: string) => Promise<VerifiedAuth>;

const verifyAgainstApi: VerifyMagicToken = (token) => verifyMagicLink(apiBase, token);

export function magicTokenFromCallbackUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).searchParams.get("token");
  } catch {
    return null;
  }
}

export async function applyAuthCallbackUrl(
  url: string | null | undefined,
  storage: AuthTokenStorage,
  verify: VerifyMagicToken = verifyAgainstApi,
): Promise<string | null> {
  const magicToken = magicTokenFromCallbackUrl(url);
  if (!magicToken) return null;
  const auth = await verify(magicToken);
  await storage.setItemAsync(AUTH_TOKEN_STORAGE_KEY, auth.token);
  return auth.token;
}

export async function importTokenFromInitialUrl(
  getInitialURL: () => Promise<string | null>,
  storage: AuthTokenStorage,
  verify: VerifyMagicToken = verifyAgainstApi,
): Promise<string | null> {
  return applyAuthCallbackUrl(await getInitialURL(), storage, verify);
}
