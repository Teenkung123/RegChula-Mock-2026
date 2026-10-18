import { migrate } from "drizzle-orm/mysql2/migrator"
import { drizzle } from "drizzle-orm/mysql2"
import mysql from "mysql2/promise"
import { resolve } from "node:path"
import { config } from "../config"

export async function runMigrations(): Promise<void> {
  const connection = await mysql.createConnection({
    uri: config.databaseUrl,
    decimalNumbers: true,
    timezone: "Z",
  })
  try {
    const migrationDb = drizzle(connection)
    await migrate(migrationDb, {
      migrationsFolder: resolve(import.meta.dir, "../../../../database/migrations"),
    })
  } finally {
    await connection.end()
  }
}
