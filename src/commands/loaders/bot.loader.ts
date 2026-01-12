import { Telegraf } from "telegraf";
import { subscribeCommand } from "../subscribe/subscribe";
import { broadcastCommand } from "../broadcast/broadcast";
import { helpCommand } from "../help/help";
import { startCommand } from "../start/start";
import { Logger } from "../../infrastructure/logger";
import { SubscriberRepository } from "../../repositories/SubscriberRepository";
import { unsubscribeCommand } from "../unsubscribe/unsubscribe";
// import { broadcastQueue } from "../broadcast/broadcast.queue";
import { Pool } from "mysql2/promise";
import { dashboardCommand } from "../dashboard/dashboard";
import { grantCommand } from "../dashboard/grant";
import { revokeCommand } from "../dashboard/revoke";
import { BroadcastWorker } from "../broadcast/BroadcastWorker";
import { TelegramMessenger } from "../../infrastructure/telegram/TelegramMessenger";

export const loadBotFeatures = (bot: Telegraf, db: Pool) => {
  try {
    Logger.info("Initializing bot features and dependencies...");

    const subscriberRepository = new SubscriberRepository(db);
    const messenger = new TelegramMessenger(bot);
    const broadcastWorker = new BroadcastWorker(
      messenger,
      subscriberRepository,
      db
    );
    // Initialize broadcast worker with dependencies
    //broadcastQueue.setupWorker(bot, subscriberRepository);

    //Feature setup
    startCommand(bot);
    subscribeCommand(bot, subscriberRepository);
    unsubscribeCommand(bot, subscriberRepository);
    helpCommand(bot);
    dashboardCommand(bot, subscriberRepository);
    grantCommand(bot, subscriberRepository);
    revokeCommand(bot, subscriberRepository);
    broadcastCommand(bot, subscriberRepository, broadcastWorker);

    Logger.info("Bot features (commands) loaded successfully.");
  } catch (error) {
    Logger.error(
      "CRITICAL: Failed to load bot features during bootstrap",
      error
    );

    throw error;
  }
};
