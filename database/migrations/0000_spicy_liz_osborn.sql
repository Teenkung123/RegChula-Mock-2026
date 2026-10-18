CREATE TABLE `academic_terms` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`academic_year` smallint unsigned NOT NULL,
	`semester` tinyint unsigned NOT NULL,
	`label` varchar(32) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `academic_terms_id` PRIMARY KEY(`id`),
	CONSTRAINT `academic_terms_year_semester_uq` UNIQUE(`academic_year`,`semester`)
);
--> statement-breakpoint
CREATE TABLE `announcements` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`body` text NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `announcements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` varchar(64) NOT NULL,
	`value` text NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `catalog_imports` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`checksum` char(64) NOT NULL,
	`status` enum('succeeded','failed') NOT NULL,
	`course_count` int unsigned NOT NULL DEFAULT 0,
	`section_count` int unsigned NOT NULL DEFAULT 0,
	`review_count` int unsigned NOT NULL DEFAULT 0,
	`conflict_count` int unsigned NOT NULL DEFAULT 0,
	`message` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `catalog_imports_id` PRIMARY KEY(`id`),
	CONSTRAINT `catalog_imports_checksum_uq` UNIQUE(`checksum`)
);
--> statement-breakpoint
CREATE TABLE `course_offerings` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`term_id` int unsigned NOT NULL,
	`course_code` varchar(24) NOT NULL,
	`name_th` varchar(500) NOT NULL,
	`name_en` varchar(500) NOT NULL,
	`short_name` varchar(255),
	`description_th` text,
	`description_en` text,
	`faculty` varchar(255) NOT NULL,
	`department` varchar(255) NOT NULL,
	`credits` decimal(4,1) NOT NULL,
	`credit_hours` varchar(100),
	`prerequisite_text` text,
	`gen_ed_type` varchar(100),
	`study_programs` json NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`source_checksum` char(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `course_offerings_id` PRIMARY KEY(`id`),
	CONSTRAINT `course_offerings_term_course_uq` UNIQUE(`term_id`,`course_code`)
);
--> statement-breakpoint
CREATE TABLE `course_reviews` (
	`review_id` varchar(80) NOT NULL,
	`course_code` varchar(24) NOT NULL,
	`term_id` int unsigned NOT NULL,
	`study_program` varchar(16),
	`rating` tinyint unsigned NOT NULL,
	`content` text NOT NULL,
	`like_count` int unsigned NOT NULL DEFAULT 0,
	`dislike_count` int unsigned NOT NULL DEFAULT 0,
	`status` varchar(32) NOT NULL,
	`source_checksum` char(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `course_reviews_review_id` PRIMARY KEY(`review_id`)
);
--> statement-breakpoint
CREATE TABLE `courses` (
	`course_code` varchar(24) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `courses_course_code` PRIMARY KEY(`course_code`)
);
--> statement-breakpoint
CREATE TABLE `idempotency_records` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`student_id` varchar(32) NOT NULL,
	`scope` varchar(64) NOT NULL,
	`idempotency_key` varchar(128) NOT NULL,
	`request_hash` char(64) NOT NULL,
	`response_status` smallint unsigned NOT NULL,
	`response_body` json NOT NULL,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `idempotency_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `idempotency_student_scope_key_uq` UNIQUE(`student_id`,`scope`,`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `registration_events` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`registration_id` bigint unsigned NOT NULL,
	`student_id` varchar(32) NOT NULL,
	`action` enum('registered','dropped','withdrawn','reactivated') NOT NULL,
	`snapshot` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `registration_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `registrations` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`student_id` varchar(32) NOT NULL,
	`term_id` int unsigned NOT NULL,
	`course_code` varchar(24) NOT NULL,
	`offering_id` bigint unsigned NOT NULL,
	`section_id` bigint unsigned NOT NULL,
	`status` enum('active','dropped','withdrawn') NOT NULL,
	`credits` decimal(4,1) NOT NULL,
	`registered_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `registrations_id` PRIMARY KEY(`id`),
	CONSTRAINT `registrations_student_term_course_uq` UNIQUE(`student_id`,`term_id`,`course_code`)
);
--> statement-breakpoint
CREATE TABLE `section_meetings` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`section_id` bigint unsigned NOT NULL,
	`class_type` varchar(80) NOT NULL,
	`day_code` varchar(12),
	`start_minute` smallint unsigned,
	`end_minute` smallint unsigned,
	`period_label` varchar(64) NOT NULL,
	`building` varchar(255),
	`room` varchar(255),
	`teachers` json NOT NULL,
	`arranged` boolean NOT NULL DEFAULT false,
	CONSTRAINT `section_meetings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sections` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`offering_id` bigint unsigned NOT NULL,
	`section_no` varchar(32) NOT NULL,
	`closed` boolean NOT NULL DEFAULT false,
	`capacity` int unsigned NOT NULL DEFAULT 0,
	`baseline_enrolled` int unsigned NOT NULL DEFAULT 0,
	`local_active` int unsigned NOT NULL DEFAULT 0,
	`note` text,
	`gen_ed_type` varchar(100),
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sections_id` PRIMARY KEY(`id`),
	CONSTRAINT `sections_offering_number_uq` UNIQUE(`offering_id`,`section_no`)
);
--> statement-breakpoint
CREATE TABLE `student_completed_courses` (
	`student_id` varchar(32) NOT NULL,
	`course_code` varchar(24) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `student_completed_courses_pk` PRIMARY KEY(`student_id`,`course_code`)
);
--> statement-breakpoint
CREATE TABLE `student_preferences` (
	`student_id` varchar(32) NOT NULL,
	`theme` enum('system','light','dark') NOT NULL DEFAULT 'system',
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `student_preferences_student_id` PRIMARY KEY(`student_id`)
);
--> statement-breakpoint
CREATE TABLE `student_term_states` (
	`student_id` varchar(32) NOT NULL,
	`term_id` int unsigned NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `student_term_states_pk` PRIMARY KEY(`student_id`,`term_id`)
);
--> statement-breakpoint
CREATE TABLE `students` (
	`student_id` varchar(32) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`last_login_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `students_student_id` PRIMARY KEY(`student_id`)
);
--> statement-breakpoint
CREATE TABLE `withdrawal_requests` (
	`id` varchar(36) NOT NULL,
	`registration_id` bigint unsigned NOT NULL,
	`student_id` varchar(32) NOT NULL,
	`term_id` int unsigned NOT NULL,
	`snapshot` json NOT NULL,
	`template_version` varchar(32) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `withdrawal_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `withdrawal_requests_registration_uq` UNIQUE(`registration_id`)
);
--> statement-breakpoint
ALTER TABLE `course_offerings` ADD CONSTRAINT `course_offerings_term_id_academic_terms_id_fk` FOREIGN KEY (`term_id`) REFERENCES `academic_terms`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `course_offerings` ADD CONSTRAINT `course_offerings_course_code_courses_course_code_fk` FOREIGN KEY (`course_code`) REFERENCES `courses`(`course_code`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `course_reviews` ADD CONSTRAINT `course_reviews_course_code_courses_course_code_fk` FOREIGN KEY (`course_code`) REFERENCES `courses`(`course_code`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `course_reviews` ADD CONSTRAINT `course_reviews_term_id_academic_terms_id_fk` FOREIGN KEY (`term_id`) REFERENCES `academic_terms`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `registration_events` ADD CONSTRAINT `registration_events_registration_id_registrations_id_fk` FOREIGN KEY (`registration_id`) REFERENCES `registrations`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `registrations` ADD CONSTRAINT `registrations_student_id_students_student_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`student_id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `registrations` ADD CONSTRAINT `registrations_term_id_academic_terms_id_fk` FOREIGN KEY (`term_id`) REFERENCES `academic_terms`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `registrations` ADD CONSTRAINT `registrations_course_code_courses_course_code_fk` FOREIGN KEY (`course_code`) REFERENCES `courses`(`course_code`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `registrations` ADD CONSTRAINT `registrations_offering_id_course_offerings_id_fk` FOREIGN KEY (`offering_id`) REFERENCES `course_offerings`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `registrations` ADD CONSTRAINT `registrations_section_id_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `section_meetings` ADD CONSTRAINT `section_meetings_section_id_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `sections` ADD CONSTRAINT `sections_offering_id_course_offerings_id_fk` FOREIGN KEY (`offering_id`) REFERENCES `course_offerings`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `student_completed_courses` ADD CONSTRAINT `student_completed_courses_student_id_students_student_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`student_id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `student_completed_courses` ADD CONSTRAINT `student_completed_courses_course_code_courses_course_code_fk` FOREIGN KEY (`course_code`) REFERENCES `courses`(`course_code`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `student_preferences` ADD CONSTRAINT `student_preferences_student_id_students_student_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`student_id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `student_term_states` ADD CONSTRAINT `student_term_states_student_id_students_student_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`student_id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `student_term_states` ADD CONSTRAINT `student_term_states_term_id_academic_terms_id_fk` FOREIGN KEY (`term_id`) REFERENCES `academic_terms`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `withdrawal_requests` ADD CONSTRAINT `withdrawal_requests_registration_id_registrations_id_fk` FOREIGN KEY (`registration_id`) REFERENCES `registrations`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX `announcements_active_order_idx` ON `announcements` (`active`,`sort_order`);--> statement-breakpoint
CREATE INDEX `catalog_imports_file_idx` ON `catalog_imports` (`file_name`,`created_at`);--> statement-breakpoint
CREATE INDEX `course_offerings_term_active_idx` ON `course_offerings` (`term_id`,`active`);--> statement-breakpoint
CREATE INDEX `course_offerings_faculty_idx` ON `course_offerings` (`term_id`,`faculty`);--> statement-breakpoint
CREATE INDEX `course_offerings_department_idx` ON `course_offerings` (`term_id`,`department`);--> statement-breakpoint
CREATE INDEX `course_offerings_credits_idx` ON `course_offerings` (`term_id`,`credits`);--> statement-breakpoint
CREATE INDEX `course_reviews_course_idx` ON `course_reviews` (`course_code`);--> statement-breakpoint
CREATE INDEX `course_reviews_course_term_idx` ON `course_reviews` (`course_code`,`term_id`);--> statement-breakpoint
CREATE INDEX `idempotency_expiry_idx` ON `idempotency_records` (`expires_at`);--> statement-breakpoint
CREATE INDEX `registration_events_registration_idx` ON `registration_events` (`registration_id`);--> statement-breakpoint
CREATE INDEX `registrations_student_term_status_idx` ON `registrations` (`student_id`,`term_id`,`status`);--> statement-breakpoint
CREATE INDEX `registrations_section_status_idx` ON `registrations` (`section_id`,`status`);--> statement-breakpoint
CREATE INDEX `section_meetings_section_idx` ON `section_meetings` (`section_id`);--> statement-breakpoint
CREATE INDEX `section_meetings_day_time_idx` ON `section_meetings` (`day_code`,`start_minute`,`end_minute`);--> statement-breakpoint
CREATE INDEX `sections_offering_active_idx` ON `sections` (`offering_id`,`active`);--> statement-breakpoint
CREATE INDEX `withdrawal_requests_student_idx` ON `withdrawal_requests` (`student_id`,`created_at`);