CREATE TABLE `student_credentials` (
	`student_id` varchar(32) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`active` boolean DEFAULT true NOT NULL,
	`updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `student_credentials_student_id` PRIMARY KEY (`student_id`),
	CONSTRAINT `student_credentials_student_fk` FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`) ON DELETE CASCADE ON UPDATE CASCADE
);
