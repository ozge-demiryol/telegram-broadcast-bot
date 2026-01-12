import { Telegraf } from "telegraf";
import { Logger } from "./infrastructure/logger";
import { loadBotFeatures } from "./commands/loaders/bot.loader";
import { CONFIG } from "./config/config";
import { Database } from "./infrastructure/database";
import { redisClient } from "./infrastructure/redisClient";

const bot = new Telegraf(CONFIG.TELEGRAM.TOKEN);

async function main() {
  try {
    Logger.info("Initializing application...");

    const db = Database.getInstance();
    //redisClient.getClient();
    loadBotFeatures(bot, db);

    if (process.env.NODE_ENV === "production") {
      await startWebhookMode();
    } else {
      await startPollingMode();
    }

    // Enable graceful stop for the process
    process.once("SIGINT", () => {
      Logger.info("Received SIGINT, shutting down gracefully...");
      bot.stop("SIGINT");
    });
    process.once("SIGTERM", () => {
      Logger.info("Received SIGTERM, shutting down gracefully...");
      bot.stop("SIGTERM");
    });
  } catch (error) {
    Logger.error("Application failed to start:", error);
    process.exit(1);
  }
}

async function startWebhookMode() {
  const { PUBLIC_URL, PORT, TOKEN } = CONFIG.TELEGRAM;
  const webhookPath = `/api/webhook/${TOKEN}`;
  const webhookUrl = `${PUBLIC_URL}${webhookPath}`;

  Logger.info(`Preparing webhook mode on port ${PORT}...`);

  await bot.launch({
    webhook: {
      domain: PUBLIC_URL,
      hookPath: webhookPath,
      port: PORT,
    },
  });

  Logger.info(`Bot successfully launched!`);
  Logger.info(`Webhook endpoint set to: ${webhookUrl}`);
}

async function startPollingMode() {
  Logger.info("Starting bot in polling mode...");

  await bot.launch();

  Logger.info("Bot successfully launched in polling mode!");
}

// Execute the application
main().catch((error) => {
  Logger.error("Unhandled error in main:", error);
  process.exit(1);
});
