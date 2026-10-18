CREATE TABLE `mock_auth_state` (
	`id` tinyint unsigned NOT NULL,
	`student_count` int unsigned NOT NULL,
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `mock_auth_state_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
INSERT INTO `mock_auth_state` (`id`, `student_count`)
SELECT 1, COUNT(*) FROM `students`;
