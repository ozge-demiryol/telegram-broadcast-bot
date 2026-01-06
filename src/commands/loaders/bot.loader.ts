import { Telegraf } from "telegraf";
import { subscribeCommand } from "../subscribe/subscribe";
import { broadcastCommand } from "../broadcast/broadcast";
import { helpCommand } from "../help/help";
import { startCommand } from "../start/start";
import { Logger } from "../../infrastructure/logger";
import { SubscriberRepository } from "../../repositories/SubscriberRepository";
import { unsubscribeCommand } from "../unsubscribe/unsubscribe";
import { Pool } from "mysql2/promise";

export const loadBotFeatures = (bot: Telegraf, db: Pool) => {
  try {
    Logger.info("Initializing bot features and dependencies...");

    const subscriberRepository = new SubscriberRepository(db);

    //Feature setup
    startCommand(bot);
    subscribeCommand(bot, subscriberRepository);
    unsubscribeCommand(bot, subscriberRepository);
    helpCommand(bot);
    broadcastCommand(bot, subscriberRepository);

    Logger.info("Bot features (commands) loaded successfully.");
  } catch (error) {
    // We catch the error to log exactly where the initialization failed
    Logger.error(
      "CRITICAL: Failed to load bot features during bootstrap",
      error
    );

    throw error;
  }
};
