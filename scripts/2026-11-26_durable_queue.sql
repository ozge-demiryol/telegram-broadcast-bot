-- Durable broadcast queue. Run ONCE (phpMyAdmin) BEFORE deploying the code that uses these columns.
-- First run this check; it must return no rows, otherwise the unique key cannot be added:
--   SELECT chat_id, message_id, COUNT(*) FROM broadcasts GROUP BY chat_id, message_id HAVING COUNT(*) > 1;
-- Applied to production on: ____-__-__

-- Safe to repeat; needed if 2026-01-22_add_cancelled_status.sql was never applied.
ALTER TABLE broadcasts MODIFY COLUMN status ENUM('pending', 'processing', 'completed', 'cancelled', 'failed') DEFAULT 'pending';

ALTER TABLE broadcasts
  ADD COLUMN last_subscriber_id INT NOT NULL DEFAULT 0,
  ADD COLUMN sent_count INT NOT NULL DEFAULT 0,
  ADD COLUMN failed_count INT NOT NULL DEFAULT 0,
  ADD COLUMN blocked_count INT NOT NULL DEFAULT 0,
  ADD COLUMN attempts INT NOT NULL DEFAULT 0,
  ADD UNIQUE KEY uq_broadcast_message (chat_id, message_id);

-- Jobs left in 'processing' by the old code would be resumed from the first subscriber
-- (everyone would get them again), so close them.
UPDATE broadcasts SET status = 'failed' WHERE status = 'processing';
