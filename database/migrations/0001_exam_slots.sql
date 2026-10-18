SET @exam_offering_prefix = 'ALTER TABLE `course_offerings` ';--> statement-breakpoint
SET @exam_offering_alter = CONCAT(
  @exam_offering_prefix,
  IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'course_offerings'
        AND column_name = 'midterm_date'
    ),
    '',
    'ADD COLUMN `midterm_date` date NULL, '
  ),
  IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'course_offerings'
        AND column_name = 'midterm_start_minute'
    ),
    '',
    'ADD COLUMN `midterm_start_minute` smallint unsigned NULL, '
  ),
  IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'course_offerings'
        AND column_name = 'midterm_end_minute'
    ),
    '',
    'ADD COLUMN `midterm_end_minute` smallint unsigned NULL, '
  ),
  IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'course_offerings'
        AND column_name = 'final_date'
    ),
    '',
    'ADD COLUMN `final_date` date NULL, '
  ),
  IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'course_offerings'
        AND column_name = 'final_start_minute'
    ),
    '',
    'ADD COLUMN `final_start_minute` smallint unsigned NULL, '
  ),
  IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'course_offerings'
        AND column_name = 'final_end_minute'
    ),
    '',
    'ADD COLUMN `final_end_minute` smallint unsigned NULL, '
  )
);--> statement-breakpoint
SET @exam_offering_alter = IF(
  @exam_offering_alter = @exam_offering_prefix,
  'SELECT 1',
  LEFT(@exam_offering_alter, CHAR_LENGTH(@exam_offering_alter) - 2)
);--> statement-breakpoint
PREPARE exam_offering_columns FROM @exam_offering_alter;--> statement-breakpoint
EXECUTE exam_offering_columns;--> statement-breakpoint
DEALLOCATE PREPARE exam_offering_columns;--> statement-breakpoint
SET @catalog_import_alter = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'catalog_imports'
      AND column_name = 'importer_version'
  ),
  'SELECT 1',
  'ALTER TABLE `catalog_imports` ADD COLUMN `importer_version` int unsigned NOT NULL DEFAULT 1'
);--> statement-breakpoint
PREPARE catalog_import_version FROM @catalog_import_alter;--> statement-breakpoint
EXECUTE catalog_import_version;--> statement-breakpoint
DEALLOCATE PREPARE catalog_import_version;
