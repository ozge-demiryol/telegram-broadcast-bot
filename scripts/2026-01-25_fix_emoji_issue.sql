ALTER TABLE bot_settings 
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  MODIFY COLUMN setting_value TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;