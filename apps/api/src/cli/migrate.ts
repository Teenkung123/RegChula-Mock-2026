import { runMigrations } from "../db/migrate"

await runMigrations()
console.log("[database] Migrations are up to date")
