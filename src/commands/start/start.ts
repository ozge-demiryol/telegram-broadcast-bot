import { Telegraf } from "telegraf";
import { Logger } from "../../infrastructure/logger";

export const startCommand = (bot: Telegraf) => {
  bot.command("start", async (ctx) => {
    try {
      Logger.info("Received /start command from user", {
        userId: ctx.from?.id,
      });
      await ctx.reply("Welcome! Use /help to see available commands.");
      Logger.info("Start command response sent");
    } catch (error) {
      Logger.error("Failed to send start command response", error);
    }
  });
};
