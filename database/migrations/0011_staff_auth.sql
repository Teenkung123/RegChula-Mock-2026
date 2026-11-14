CREATE TABLE `staff_users` (
  `id` char(36) NOT NULL PRIMARY KEY,
  `username` varchar(100) NOT NULL,
  `display_name` varchar(200) NOT NULL,
  `role` enum('admin','advisor') NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `active` boolean NOT NULL DEFAULT true,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `staff_users_username_unique` (`username`)
);
--> statement-breakpoint
CREATE TABLE `staff_sessions` (
  `token_hash` char(64) NOT NULL PRIMARY KEY,
  `staff_id` char(36) NOT NULL,
  `idle_expires_at` timestamp NOT NULL,
  `absolute_expires_at` timestamp NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `staff_sessions_staff_idx` (`staff_id`),
  CONSTRAINT `staff_sessions_staff_fk` FOREIGN KEY (`staff_id`) REFERENCES `staff_users` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `student_advisors` (
  `student_id` varchar(32) NOT NULL PRIMARY KEY,
  `staff_id` char(36) NOT NULL,
  KEY `student_advisors_staff_idx` (`staff_id`),
  CONSTRAINT `student_advisors_staff_fk` FOREIGN KEY (`staff_id`) REFERENCES `staff_users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `student_advisors_student_fk` FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `staff_audit_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `staff_id` char(36) NOT NULL,
  `action` varchar(80) NOT NULL,
  `target` varchar(255) NOT NULL,
  `details` json NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `staff_audit_events_actor_idx` (`staff_id`, `created_at`),
  CONSTRAINT `staff_audit_events_staff_fk` FOREIGN KEY (`staff_id`) REFERENCES `staff_users` (`id`) ON DELETE RESTRICT
);
