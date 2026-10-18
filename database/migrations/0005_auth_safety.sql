CREATE TABLE `auth_challenge_consumptions` (
	`nonce` char(36) NOT NULL,
	`request_hash` char(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`consumed_at` timestamp DEFAULT (now()) NOT NULL,
	CONSTRAINT `auth_challenge_consumptions_nonce` PRIMARY KEY(`nonce`)
);
--> statement-breakpoint
CREATE INDEX `auth_challenge_consumptions_expiry_idx` ON `auth_challenge_consumptions` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `student_sessions` (
	`token_hash` char(64) NOT NULL,
	`student_id` varchar(32) NOT NULL,
	`remember_me` boolean DEFAULT false NOT NULL,
	`idle_timeout_seconds` int unsigned NOT NULL,
	`last_seen_at` timestamp NOT NULL,
	`idle_expires_at` timestamp NOT NULL,
	`absolute_expires_at` timestamp NOT NULL,
	`revoked_at` timestamp,
	`created_at` timestamp DEFAULT (now()) NOT NULL,
	CONSTRAINT `student_sessions_token_hash` PRIMARY KEY(`token_hash`)
);
--> statement-breakpoint
ALTER TABLE `student_sessions` ADD CONSTRAINT `student_sessions_student_id_students_student_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`student_id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
CREATE INDEX `student_sessions_student_idx` ON `student_sessions` (`student_id`);
--> statement-breakpoint
CREATE INDEX `student_sessions_idle_expiry_idx` ON `student_sessions` (`idle_expires_at`);
--> statement-breakpoint
CREATE INDEX `student_sessions_absolute_expiry_idx` ON `student_sessions` (`absolute_expires_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idempotency_student_scope_request_uq` ON `idempotency_records` (`student_id`,`scope`,`request_hash`);
