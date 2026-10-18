import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema/index.ts",
  out: "../../database/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "mysql://regchula:regchula_dev@127.0.0.1:3307/regchula",
  },
  strict: true,
  verbose: true,
})
