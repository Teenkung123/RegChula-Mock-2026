import { describe, expect, it } from "bun:test"
import type { RowDataPacket } from "mysql2"
import { pool } from "../../db/client"
import { staffTermsQuery } from "./catalog"

const mysqlIntegration = process.env.REGC_MYSQL_INTEGRATION === "1" ? describe : describe.skip

mysqlIntegration("staff terms with mixed MySQL collations", () => {
  it("identifies the current term and handles a missing setting", async () => {
    const connection = await pool.getConnection()
    try {
      await connection.query("SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci")
      await connection.query(`CREATE TEMPORARY TABLE academic_terms (
        id INT UNSIGNED PRIMARY KEY, academic_year INT NOT NULL, semester INT NOT NULL,
        label VARCHAR(32) NOT NULL, active BOOLEAN NOT NULL
      )`)
      await connection.query(`CREATE TEMPORARY TABLE app_settings (
        \`key\` VARCHAR(64) PRIMARY KEY, value TEXT COLLATE utf8mb4_unicode_ci NOT NULL
      )`)
      await connection.query(`CREATE TEMPORARY TABLE term_registration_windows (
        term_id INT UNSIGNED PRIMARY KEY, opens_at DATETIME NULL, closes_at DATETIME NULL
      )`)
      await connection.query("INSERT INTO academic_terms VALUES (1, 2569, 1, 'First', 1), (2, 2569, 2, 'Second', 1)")
      await connection.query("INSERT INTO app_settings VALUES ('current_term_id', '2')")
      const [collations] = await connection.query<RowDataPacket[]>(`SELECT
        COLLATION(s.value) AS settingCollation, COLLATION(CAST(t.id AS CHAR)) AS idCollation
        FROM academic_terms t JOIN app_settings s LIMIT 1`)
      expect(collations[0]).toMatchObject({
        settingCollation: "utf8mb4_unicode_ci",
        idCollation: "utf8mb4_0900_ai_ci",
      })
      const [rows] = await connection.query<RowDataPacket[]>(staffTermsQuery)
      expect(rows.map(({ id, isCurrent }) => [id, Boolean(isCurrent)])).toEqual([[2, true], [1, false]])

      await connection.query("DELETE FROM app_settings WHERE `key` = 'current_term_id'")
      const [withoutSetting] = await connection.query<RowDataPacket[]>(staffTermsQuery)
      expect(withoutSetting.every(({ isCurrent }) => !Boolean(isCurrent))).toBe(true)
    } finally {
      connection.destroy()
    }
  })
})
