CREATE TABLE `term_registration_windows` (
  `term_id` int unsigned NOT NULL PRIMARY KEY,
  `opens_at` datetime(3) NOT NULL,
  `closes_at` datetime(3) NOT NULL,
  CONSTRAINT `term_registration_windows_term_fk` FOREIGN KEY (`term_id`) REFERENCES `academic_terms` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `staff_catalog_previews` (
  `staff_id` char(36) NOT NULL,
  `checksum` char(64) NOT NULL,
  `catalog_revision` bigint unsigned NOT NULL,
  `expires_at` datetime(3) NOT NULL,
  PRIMARY KEY (`staff_id`, `checksum`),
  CONSTRAINT `staff_catalog_previews_staff_fk` FOREIGN KEY (`staff_id`) REFERENCES `staff_users` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `catalog_revision` (
  `id` tinyint unsigned NOT NULL PRIMARY KEY,
  `revision` bigint unsigned NOT NULL DEFAULT 0
);
--> statement-breakpoint
INSERT INTO `catalog_revision` (`id`, `revision`) VALUES (1, 0);
