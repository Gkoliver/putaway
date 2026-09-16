import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function filePath() {
  return join(process.cwd(), ".dev-magic-link");
}

export function rememberDevMagicLink(url: string) {
  writeFileSync(filePath(), url, "utf8");
}

export function getDevMagicLink(): string | null {
  try {
    const value = readFileSync(filePath(), "utf8").trim();
    return value || null;
  } catch {
    return null;
  }
}

export function clearDevMagicLink() {
  if (existsSync(filePath())) unlinkSync(filePath());
}

export function devMagicLinkResponse(env = process.env.NODE_ENV): Response {
  if (env === "production") {
    return new Response(null, { status: 404 });
  }
  const url = getDevMagicLink();
  if (!url) return Response.json({ url: null });
  return Response.json({ url });
}
