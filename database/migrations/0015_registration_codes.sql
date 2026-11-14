CREATE TABLE `student_registration_profiles` (
  `student_id` varchar(32) NOT NULL PRIMARY KEY,
  `first_term_id` int unsigned NOT NULL,
  `academic_level` enum('undergraduate','graduate') NOT NULL,
  CONSTRAINT `registration_profiles_student_fk` FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`) ON DELETE CASCADE,
  CONSTRAINT `registration_profiles_first_term_fk` FOREIGN KEY (`first_term_id`) REFERENCES `academic_terms` (`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `registration_access_codes` (
  `student_id` varchar(32) NOT NULL,
  `cycle_year` smallint unsigned NOT NULL,
  `cycle_kind` enum('second','summer_first') NOT NULL,
  `encrypted_code` varchar(255) NOT NULL,
  `version` int unsigned NOT NULL DEFAULT 1,
  `updated_by` char(36) NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`student_id`,`cycle_year`,`cycle_kind`),
  CONSTRAINT `registration_codes_student_fk` FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`) ON DELETE CASCADE,
  CONSTRAINT `registration_codes_staff_fk` FOREIGN KEY (`updated_by`) REFERENCES `staff_users` (`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `registration_access_grants` (
  `student_id` varchar(32) NOT NULL,
  `term_id` int unsigned NOT NULL,
  `cycle_year` smallint unsigned NOT NULL,
  `cycle_kind` enum('second','summer_first') NOT NULL,
  `code_version` int unsigned NOT NULL,
  PRIMARY KEY (`student_id`,`term_id`),
  CONSTRAINT `registration_grants_student_fk` FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`) ON DELETE CASCADE,
  CONSTRAINT `registration_grants_term_fk` FOREIGN KEY (`term_id`) REFERENCES `academic_terms` (`id`) ON DELETE CASCADE
);
