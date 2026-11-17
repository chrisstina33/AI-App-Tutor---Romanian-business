import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { getDatabaseConnectionOptions } from "./server/_core/databaseConfig";

const connection = getDatabaseConnectionOptions();
if (!connection) {
  throw new Error("Set DATABASE_URL or all DATABASE_HOST/PORT/USER/PASSWORD/NAME fields to run database commands.");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    ...connection,
    ...(process.env.DATABASE_SSL === "true"
      ? { ssl: { rejectUnauthorized: true } }
      : {}),
  },
});
