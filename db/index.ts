import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.ts";

let pool: Pool | undefined;

export function getDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Configure it via environment variables/Secrets Manager before using the database.");
  }

  pool ??= new Pool({ connectionString });
  return drizzle(pool, { schema });
}
