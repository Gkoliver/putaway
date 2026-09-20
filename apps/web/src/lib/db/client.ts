import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export function getDb(url = process.env.DATABASE_URL!): Database {
  const pool = new Pool({ connectionString: url });
  return drizzle(pool, { schema });
}
