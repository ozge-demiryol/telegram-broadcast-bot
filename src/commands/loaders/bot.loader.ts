import { Telegraf } from "telegraf";
import { subscribeCommand } from "../subscribe/subscribe";
import { broadcastCommand } from "../broadcast/broadcast";
import { helpCommand } from "../help/help";
import { startCommand } from "../start/start";
import { speedCommand } from "../speed/speed";
import { statsCommand } from "../stats/stats";
import { GetLogger } from "../../infrastructure/logger";
import { SubscriberRepository } from "../../repositories/SubscriberRepository";
import { unsubscribeCommand } from "../unsubscribe/unsubscribe";
import { Pool } from "mysql2/promise";
import { dashboardCommand } from "../dashboard/dashboard";
import { grantCommand } from "../dashboard/grant";
import { revokeCommand } from "../dashboard/revoke";
import { BroadcastWorker } from "../broadcast/BroadcastWorker";
import { TelegramMessenger } from "../../infrastructure/telegram/TelegramMessenger";
import { BroadcastRepository } from "../../repositories/broadcast/BroadcastRepository";
import { SettingsRepository } from "../../repositories/settings/SettingsRepository";
import { setWelcomeCommand } from "../setWelcome/setWelcome";

export const loadBotFeatures = (bot: Telegraf, db: Pool) => {
  const logger = GetLogger("BotFeatures");
  try {
    logger.info("Initializing bot features and dependencies...");

    const subscriberRepository = new SubscriberRepository(db);
    const broadcastRepository = new BroadcastRepository(db);
    const settingsRepository = new SettingsRepository(db);
    const messenger = new TelegramMessenger(bot);
    const broadcastWorker = new BroadcastWorker(
      messenger,
      subscriberRepository,
      broadcastRepository,
      settingsRepository
    );

    //Feature setup
    startCommand(bot, settingsRepository, subscriberRepository);
    subscribeCommand(bot, subscriberRepository);
    unsubscribeCommand(bot, subscriberRepository);
    helpCommand(bot);
    dashboardCommand(bot, subscriberRepository);
    grantCommand(bot, subscriberRepository);
    revokeCommand(bot, subscriberRepository);
    speedCommand(bot, broadcastWorker, subscriberRepository);
    statsCommand(bot, broadcastWorker, subscriberRepository);
    setWelcomeCommand(bot, subscriberRepository, settingsRepository);
    broadcastCommand(
      bot,
      subscriberRepository,
      broadcastRepository,
      broadcastWorker
    );

    logger.info("Bot features (commands) loaded successfully.");
  } catch (error) {
    logger.error(
      "CRITICAL: Failed to load bot features during bootstrap",
      error
    );

    throw error;
  }
};
