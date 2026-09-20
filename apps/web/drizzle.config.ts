import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is required to run drizzle-kit");
}

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
});
