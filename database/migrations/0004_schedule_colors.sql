CREATE TABLE IF NOT EXISTS `student_schedule_colors` (
  `student_id` varchar(32) NOT NULL,
  `term_id` int unsigned NOT NULL,
  `course_code` varchar(24) NOT NULL,
  `color_id` enum('rose','orange','amber','green','teal','blue','indigo','violet') NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `student_schedule_colors_pk` PRIMARY KEY (`student_id`,`term_id`,`course_code`),
  CONSTRAINT `student_schedule_colors_student_id_students_student_id_fk`
    FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `student_schedule_colors_term_id_academic_terms_id_fk`
    FOREIGN KEY (`term_id`) REFERENCES `academic_terms` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `student_schedule_colors_course_code_courses_course_code_fk`
    FOREIGN KEY (`course_code`) REFERENCES `courses` (`course_code`) ON DELETE CASCADE ON UPDATE CASCADE
);
