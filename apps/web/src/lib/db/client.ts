import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export function getDb(url = process.env.DATABASE_URL!) {
  const pool = new Pool({ connectionString: url });
  return drizzle(pool, { schema });
}

export type Database = ReturnType<typeof getDb>;
