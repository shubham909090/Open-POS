import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/drizzle-schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.HUB_DATABASE_PATH ?? "./data/hub.sqlite"
  },
  verbose: true,
  strict: true
});
