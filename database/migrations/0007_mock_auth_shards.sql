CREATE TABLE `mock_auth_shards` (
	`shard_id` tinyint unsigned NOT NULL,
	`student_count` int unsigned NOT NULL,
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `mock_auth_shards_shard_id` PRIMARY KEY(`shard_id`)
);
--> statement-breakpoint
INSERT INTO `mock_auth_shards` (`shard_id`, `student_count`)
WITH RECURSIVE `shards` (`id`) AS (
	SELECT 0
	UNION ALL
	SELECT `id` + 1 FROM `shards` WHERE `id` < 255
)
SELECT `id`, (
	SELECT COUNT(*) FROM `students`
	WHERE CONV(SUBSTRING(SHA2(`student_id`, 256), 1, 2), 16, 10) = `id`
) FROM `shards`;
