SET @content_layout_alter = IF(
  EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'student_preferences' AND column_name = 'content_layout'),
  'SELECT 1',
  'ALTER TABLE `student_preferences` ADD COLUMN `content_layout` enum(''fluid'',''contained'') NOT NULL DEFAULT ''fluid'''
);--> statement-breakpoint
PREPARE add_content_layout FROM @content_layout_alter;--> statement-breakpoint
EXECUTE add_content_layout;--> statement-breakpoint
DEALLOCATE PREPARE add_content_layout;
