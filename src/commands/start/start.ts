import { Telegraf, Markup } from "telegraf";
import { GetLogger } from "../../infrastructure/logger";

import { ISettingsRepository } from "../../repositories/settings/ISettingsRepository";

export const startCommand = (bot: Telegraf, settingsRepository: ISettingsRepository) => {
  const logger = GetLogger("StartCommand");

  const welcomeKeyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback("🔔 Subscribe", "subscribe_action"),
      Markup.button.callback("🔕 Unsubscribe", "unsubscribe_action"),
    ],
    [Markup.button.callback("❓ Help", "help_action")],
  ]);

  bot.command("start", async (ctx) => {
    try {
      logger.info("Received /start command from user", {
        userId: ctx.from?.id,
      });

      const welcomeMessage = await settingsRepository.getWelcomeMessage();
      await ctx.reply(welcomeMessage, welcomeKeyboard);

      logger.info("Start command response sent");
    } catch (error) {
      logger.error("Failed to send start command response", error);
    }
  });
};
