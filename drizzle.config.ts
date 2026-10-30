import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set.");
}

console.log("Using connection string:", connectionString);

export default defineConfig({
  dialect: "postgresql",
  strict: true,
  verbose: true,
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    url: connectionString,
  },
});
