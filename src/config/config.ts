import dotenv from "dotenv";
dotenv.config();

export const CONFIG = {
  DB: {
    CONNECTION_STRING:
      process.env.DB_CONNECTION_STRING || "mysql://root:@localhost:3306/bot_db",
  },
  TELEGRAM: {
    TOKEN: process.env.TELEGRAM_TOKEN || "",
    PUBLIC_URL: process.env.PUBLIC_URL || "",
    PORT: parseInt(process.env.PORT || "3000") || 3000,
    CONCURRENT_REQUESTS: 3, // Max. number of concurrent requests to Telegram API is 5, but we chose 3 for safe
    RATE_LIMIT: 25, //Max. limit of messages per second is 30 but we chose 25 to be stay at safe zone
  },
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
};

if (!CONFIG.TELEGRAM.TOKEN) {
  throw new Error(
    "CRITICAL: TELEGRAM_TOKEN is missing in environment variables!"
  );
}
