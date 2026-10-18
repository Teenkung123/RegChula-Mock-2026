import type { ResultSetHeader } from "mysql2/promise"
import { closeDatabase, pool } from "../db/client"

try {
  const [sessions] = await pool.execute<ResultSetHeader>(
    [
      "DELETE FROM student_sessions",
      "WHERE absolute_expires_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 DAY)",
      "OR revoked_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 DAY)",
      "ORDER BY absolute_expires_at LIMIT 1000",
    ].join(" "),
  )
  const [challenges] = await pool.execute<ResultSetHeader>(
    [
      "DELETE FROM auth_challenge_consumptions",
      "WHERE expires_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 HOUR)",
      "ORDER BY expires_at LIMIT 1000",
    ].join(" "),
  )
  await pool.execute(
    "UPDATE mock_auth_state SET student_count = (SELECT COUNT(*) FROM students) WHERE id = 1",
  )
  await pool.execute(
    [
      "UPDATE mock_auth_shards s SET student_count = (",
      "SELECT COUNT(*) FROM students",
      "WHERE CONV(SUBSTRING(SHA2(student_id, 256), 1, 2), 16, 10) = s.shard_id)",
    ].join(" "),
  )
  console.log(
    `[auth] Removed ${sessions.affectedRows} expired/revoked sessions and ${challenges.affectedRows} expired challenges`,
  )
} finally {
  await closeDatabase()
}
