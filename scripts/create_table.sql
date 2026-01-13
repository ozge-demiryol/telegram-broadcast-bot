USE telegram_bot;

CREATE TABLE IF NOT EXISTS subscribers (
    id INT AUTO_INCREMENT PRIMARY KEY,          -- Unique identifier for each record
    username VARCHAR(100),                      -- Telegram username
    telegramId BIGINT NOT NULL UNIQUE,          -- Unique ID provided by Telegram (Required and Unique)
    isActive BOOLEAN DEFAULT TRUE,              -- Subscription status (Default: Active)
    isAdmin BOOLEAN DEFAULT FALSE,              -- Admin privilege (Default: No)
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Registration date
    modifiedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP -- Last update date

    INDEX idx_active_users (isActive),
    INDEX idx_admin_only (isAdmin)
);

CREATE TABLE broadcasts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id BIGINT,
    message_id BIGINT,
    chat_id BIGINT,
    status ENUM('pending', 'processing', 'completed') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modifiedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);