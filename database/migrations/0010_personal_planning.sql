CREATE TABLE `student_activities` (
  `id` char(36) NOT NULL PRIMARY KEY,
  `student_id` varchar(32) NOT NULL,
  `term_id` int unsigned NOT NULL,
  `title` varchar(100) NOT NULL,
  `day_code` enum('MO','TU','WE','TH','FR','SA','SU') NOT NULL,
  `start_minute` smallint unsigned NOT NULL,
  `end_minute` smallint unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `student_activities_student_fk` FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`) ON DELETE RESTRICT,
  CONSTRAINT `student_activities_term_fk` FOREIGN KEY (`term_id`) REFERENCES `academic_terms` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `student_activities_time_check` CHECK (`start_minute` < `end_minute` AND `end_minute` <= 1440),
  INDEX `student_activities_owner_term_idx` (`student_id`, `term_id`)
);
--> statement-breakpoint
CREATE TABLE `student_favorites` (
  `student_id` varchar(32) NOT NULL,
  `course_code` varchar(24) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`student_id`, `course_code`),
  CONSTRAINT `student_favorites_student_fk` FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`) ON DELETE RESTRICT,
  CONSTRAINT `student_favorites_course_fk` FOREIGN KEY (`course_code`) REFERENCES `courses` (`course_code`) ON DELETE RESTRICT ON UPDATE CASCADE
);
