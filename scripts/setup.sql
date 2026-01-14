-- 1. Create the database if it doesn't exist
CREATE DATABASE IF NOT EXISTS telegram_bot;

USE telegram_bot;

-- 2. Subscribers Table
CREATE TABLE IF NOT EXISTS subscribers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100),
    telegramId BIGINT NOT NULL UNIQUE,
    isActive BOOLEAN DEFAULT TRUE,
    isAdmin BOOLEAN DEFAULT FALSE,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modifiedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 3. Indexes
CREATE INDEX idx_active_users ON subscribers(isActive);
CREATE INDEX idx_admin_only ON subscribers(isAdmin);

-- 4. Broadcasts Table
CREATE TABLE IF NOT EXISTS broadcasts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id BIGINT,
    message_id BIGINT,
    chat_id BIGINT,
    status ENUM('pending', 'processing', 'completed') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modifiedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);