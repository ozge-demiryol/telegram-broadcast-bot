import { Telegraf } from "telegraf";
import { GetLogger } from "../../infrastructure/logger";

export const startCommand = (bot: Telegraf) => {
  const logger = GetLogger("StartCommand");
  bot.command("start", async (ctx) => {
    try {
      logger.info("Received /start command from user", {
        userId: ctx.from?.id,
      });
      await ctx.reply("Welcome! Use /help to see available commands.");
      logger.info("Start command response sent");
    } catch (error) {
      logger.error("Failed to send start command response", error);
    }
  });
};
