import { Telegraf } from "telegraf";
import { GetLogger } from "./infrastructure/logger";
import { loadBotFeatures } from "./commands/loaders/bot.loader";
import { CONFIG } from "./config/config";
import { Database } from "./infrastructure/database";

const bot = new Telegraf(CONFIG.TELEGRAM.TOKEN);
const logger = GetLogger("Main");

async function main() {
  try {
    logger.info("Initializing application...");

    const db = Database.getInstance();
    loadBotFeatures(bot, db);

    if (process.env.NODE_ENV === "production") {
      await startWebhookMode();
    } else {
      await startPollingMode();
    }

    // Enable graceful stop for the process
    process.once("SIGINT", () => {
      logger.info("Received SIGINT, shutting down gracefully...");
      bot.stop("SIGINT");
    });
    process.once("SIGTERM", () => {
      logger.info("Received SIGTERM, shutting down gracefully...");
      bot.stop("SIGTERM");
    });
  } catch (error) {
    logger.error("Application failed to start:", error);
    process.exit(1);
  }
}

async function startWebhookMode() {
  const { PUBLIC_URL, PORT, TOKEN } = CONFIG.TELEGRAM;
  const webhookPath = `/api/webhook/${TOKEN}`;
  const webhookUrl = `${PUBLIC_URL}${webhookPath}`;

  logger.info(`Preparing webhook mode on port ${PORT}...`);

  await bot.launch({
    webhook: {
      domain: PUBLIC_URL,
      hookPath: webhookPath,
      port: PORT,
    },
  });

  logger.info(`Bot successfully launched!`);
  logger.info(`Webhook endpoint set to: ${webhookUrl}`);
}

async function startPollingMode() {
  logger.info("Starting bot in polling mode...");

  await bot.launch();

  logger.info("Bot successfully launched in polling mode!");
}

// Execute the application
main().catch((error) => {
  logger.error("Unhandled error in main:", error);
  process.exit(1);
});
