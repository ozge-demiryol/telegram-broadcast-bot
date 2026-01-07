USE telegram_bot;

CREATE TABLE IF NOT EXISTS subscribers (
    id INT AUTO_INCREMENT PRIMARY KEY,          -- Otomatik artan ana anahtar
    username VARCHAR(100),                      -- Telegram kullanıcı adı
    telegramId BIGINT NOT NULL UNIQUE,          -- Telegram'ın verdiği eşsiz ID (Zorunlu ve Tekil)
    isActive BOOLEAN DEFAULT TRUE,              -- Abonelik durumu (Varsayılan: Aktif)
    isAdmin BOOLEAN DEFAULT FALSE,              -- Yönetici yetkisi (Varsayılan: Hayır)
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Kayıt tarihi
    modifiedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP -- Güncellenme tarihi
);