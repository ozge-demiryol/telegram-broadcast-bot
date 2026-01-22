ALTER TABLE broadcasts MODIFY COLUMN status ENUM('pending', 'processing', 'completed', 'cancelled', 'failed') DEFAULT 'pending';
