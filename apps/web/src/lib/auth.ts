import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { bearer, magicLink } from "better-auth/plugins";
import { getDb } from "./db/client";
import { rememberDevMagicLink } from "./dev-magic-link";
import * as schema from "./db/schema";

const dbUrl =
  process.env.DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  "postgresql://putaway:putaway@localhost:5432/putaway";

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
  throw new Error("BETTER_AUTH_SECRET is required");
}

export const auth = betterAuth({
  database: drizzleAdapter(getDb(dbUrl), {
    provider: "pg",
    schema,
  }),
  secret,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  trustedOrigins: [
    "putaway://",
    "putaway://*",
    ...(process.env.NODE_ENV === "production" ? [] : ["exp://", "exp://**"]),
  ],
  plugins: [
    expo(),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        if (process.env.NODE_ENV !== "production") {
          rememberDevMagicLink(url);
          console.log(`Magic link for ${email}: ${url}`);
          return;
        }
        if (!process.env.RESEND_API_KEY) {
          throw new Error(
            "Magic link email is not configured for production. Set RESEND_API_KEY.",
          );
        }
        const from =
          process.env.RESEND_FROM ?? "Put Away <onboarding@resend.dev>";
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: [email],
            subject: "Sign in to Put Away",
            html: `<p><a href="${url}">Sign in to Put Away</a></p>`,
          }),
        });
        if (!res.ok) {
          throw new Error(`Failed to send magic link email (${res.status})`);
        }
      },
    }),
    bearer(),
    nextCookies(),
  ],
});

export async function getUserIdFromRequest(req: Request): Promise<string | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  return session?.user?.id ?? null;
}

export async function getSessionUser(
  req: Request,
): Promise<{ id: string; email: string } | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id || !session.user.email) return null;
  return { id: session.user.id, email: session.user.email };
}
