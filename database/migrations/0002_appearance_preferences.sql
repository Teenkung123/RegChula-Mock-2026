SET @appearance_prefix = 'ALTER TABLE `student_preferences` ';--> statement-breakpoint
SET @appearance_alter = CONCAT(
  @appearance_prefix,
  IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'student_preferences'
        AND column_name = 'accent_preset'
    ),
    '',
    'ADD COLUMN `accent_preset` enum(''rose'',''coral'',''indigo'',''forest'',''violet'',''amber'',''berry'',''teal'',''slate'',''clay'',''mint'',''custom'') NOT NULL DEFAULT ''rose'', '
  ),
  IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'student_preferences'
        AND column_name = 'custom_accent'
    ),
    '',
    'ADD COLUMN `custom_accent` char(7) NULL, '
  ),
  IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'student_preferences'
        AND column_name = 'ui_scale'
    ),
    '',
    'ADD COLUMN `ui_scale` decimal(3,2) NOT NULL DEFAULT 1.00, '
  ),
  IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'student_preferences'
        AND column_name = 'content_width'
    ),
    '',
    'ADD COLUMN `content_width` smallint unsigned NOT NULL DEFAULT 1120, '
  ),
  IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'student_preferences'
        AND column_name = 'label_style'
    ),
    '',
    'ADD COLUMN `label_style` enum(''soft'',''solid'') NOT NULL DEFAULT ''soft'', '
  ),
  IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'student_preferences'
        AND column_name = 'detail_presentation'
    ),
    '',
    'ADD COLUMN `detail_presentation` enum(''drawer'',''modal'') NOT NULL DEFAULT ''modal'', '
  ),
  IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'student_preferences'
        AND column_name = 'language'
    ),
    '',
    'ADD COLUMN `language` enum(''th'',''en'',''zh'') NOT NULL DEFAULT ''th'', '
  )
);--> statement-breakpoint
SET @appearance_alter = IF(
  @appearance_alter = @appearance_prefix,
  'SELECT 1',
  LEFT(@appearance_alter, CHAR_LENGTH(@appearance_alter) - 2)
);--> statement-breakpoint
PREPARE appearance_preference_columns FROM @appearance_alter;--> statement-breakpoint
EXECUTE appearance_preference_columns;--> statement-breakpoint
DEALLOCATE PREPARE appearance_preference_columns;
