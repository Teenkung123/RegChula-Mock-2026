ALTER TABLE `auth_challenge_consumptions` ADD `previous_session_hash` char(64);
--> statement-breakpoint
DELETE older FROM `student_sessions` older
INNER JOIN `student_sessions` newer
  ON newer.`student_id` = older.`student_id`
  AND (
    newer.`created_at` > older.`created_at`
    OR (newer.`created_at` = older.`created_at` AND newer.`token_hash` > older.`token_hash`)
  );
--> statement-breakpoint
CREATE UNIQUE INDEX `student_sessions_student_uq` ON `student_sessions` (`student_id`);
