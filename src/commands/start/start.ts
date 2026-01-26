import { Telegraf, Markup } from "telegraf";
import { GetLogger } from "../../infrastructure/logger";

import { ISettingsRepository } from "../../repositories/settings/ISettingsRepository";
import { ISubscriberRepository } from "../../repositories/ISubscriberRepository";

export const startCommand = (
  bot: Telegraf,
  settingsRepository: ISettingsRepository,
  subscriberRepository: ISubscriberRepository
) => {
  const logger = GetLogger("StartCommand");

  bot.command("start", async (ctx) => {
    try {
      logger.info("Received /start command from user", {
        userId: ctx.from?.id,
        username: ctx.from?.username,
        displayName: ctx.from?.first_name,
      });

      const welcomeMessage = await settingsRepository.getWelcomeMessage();

      const subscriber = ctx.from?.id
        ? await subscriberRepository.findByTelegramId(ctx.from.id)
        : null;

      const buttons = [];

      if (subscriber?.isActive) {
        buttons.push(
          Markup.button.callback("🔕 Unsubscribe", "unsubscribe_action")
        );
      } else {
        buttons.push(Markup.button.callback("🔔 Subscribe", "subscribe_action"));
      }

      buttons.push(Markup.button.callback("❓ Help", "help_action"));

      const welcomeKeyboard = Markup.inlineKeyboard([buttons]);

      await ctx.reply(welcomeMessage, {
        parse_mode: "Markdown",
        ...welcomeKeyboard,
      });

      logger.info("Start command response sent");
    } catch (error) {
      logger.error("Failed to send start command response", error);
    }
  });
};
