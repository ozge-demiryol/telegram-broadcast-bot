import dotenv from "dotenv";
dotenv.config();

export const CONFIG = {
  DB: {
    HOST: process.env.DB_HOST || "127.0.0.1",
    PORT: parseInt(process.env.DB_PORT || "3306"),
    USER: process.env.DB_USER || "root",
    PASSWORD: process.env.DB_PASSWORD || "rootpassword",
    DATABASE: process.env.DB_NAME || "telegram_bot",
    CONNECTION_STRING:
      process.env.DB_CONNECTION_STRING ||
      "mysql://root:rootpassword@localhost:3306/telegram_bot",
  },
  REDIS: {
    PORT: parseInt(process.env.REDIS_PORT || "6379") || 6379,
    HOST: process.env.REDIS_HOST || "localhost",
    PASSWORD: process.env.REDIS_PASSWORD || undefined,
    MAX_RETRIES: parseInt(process.env.REDIS_MAX_RETRIES || "5") || 5,
    CONNECTION_NAME: process.env.REDIS_CONNECTION_NAME || "telegram-bot-redis",
  },
  TELEGRAM: {
    TOKEN: process.env.TELEGRAM_TOKEN || "",
    PUBLIC_URL: process.env.PUBLIC_URL || "",
    PORT: parseInt(process.env.PORT || "3000") || 3000, // Max. number of concurrent requests to Telegram API is 5, but we chose 3 for safe
    CHUNK_SIZE: parseInt(process.env.RATE_LIMIT || "25") || 25, //Max. limit of messages per second is 30 but we chose 25 to be stay at safe zone
    MIN_TIME: parseInt(process.env.MIN_TIME || "200") || 200, // Min time between messages in ms (approx. 6-7 messages per second)
    PAGE_SIZE: parseInt(process.env.PAGE_SIZE || "500") || 500,
  },
  DRY_RUN: process.env.DRY_RUN === "true",
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
};

if (!CONFIG.TELEGRAM.TOKEN) {
  throw new Error(
    "CRITICAL: TELEGRAM_TOKEN is missing in environment variables!"
  );
}
