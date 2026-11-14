ALTER TABLE `registrations` MODIFY COLUMN `status` enum('active','dropped','withdrawn','removed') NOT NULL;
--> statement-breakpoint
ALTER TABLE `registration_events` MODIFY COLUMN `action` enum('registered','dropped','withdrawn','reactivated','removed') NOT NULL;
