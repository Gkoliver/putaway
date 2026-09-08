import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "./schema";
import type { Database } from "./client";

export async function withTestDb(fn: (db: Database) => Promise<void>) {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is required");
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  try {
    await fn(db as unknown as Database);
  } finally {
    await pool.query(`
      truncate command_receipts, stock_lots, locations, items, invites, household_members, households
      restart identity cascade
    `);
    await pool.end();
  }
}
