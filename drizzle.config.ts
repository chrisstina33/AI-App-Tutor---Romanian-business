import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { getDatabaseConnectionUrl } from "./server/_core/databaseConfig";

const connectionString = getDatabaseConnectionUrl();
if (!connectionString) {
  throw new Error("Set DATABASE_URL or all DATABASE_HOST/PORT/USER/PASSWORD/NAME fields to run database commands.");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: connectionString,
    ...(process.env.DATABASE_SSL === "true"
      ? { ssl: { minVersion: "TLSv1.2" as const } }
      : {}),
  },
});
