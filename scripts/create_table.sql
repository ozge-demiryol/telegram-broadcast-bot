USE telegram_bot;

CREATE TABLE IF NOT EXISTS subscribers (
    id INT AUTO_INCREMENT PRIMARY KEY,          -- Otomatik artan ana anahtar
    username VARCHAR(100),                      -- Telegram kullanıcı adı
    telegramId BIGINT NOT NULL UNIQUE,          -- Unique ID provided by Telegram (Required and Unique)
    isActive BOOLEAN DEFAULT TRUE,              -- Subscription status (Default: Active)
    isAdmin BOOLEAN DEFAULT FALSE,              -- Admin privilege (Default: No)
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Registration date
    modifiedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP -- Last update date
);