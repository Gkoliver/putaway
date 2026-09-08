import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";

export const apiBase = process.env.EXPO_PUBLIC_API_BASE ?? "http://localhost:3000";

export const authClient = createAuthClient({
  baseURL: apiBase,
  plugins: [
    expoClient({
      scheme: "putaway",
      storagePrefix: "putaway",
      storage: SecureStore,
    }),
    magicLinkClient(),
  ],
});
