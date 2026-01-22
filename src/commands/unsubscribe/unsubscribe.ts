import { GetLogger } from "../../infrastructure/logger";
import { Context, Telegraf } from "telegraf";
import { ISubscriberRepository } from "@/repositories/ISubscriberRepository";

export const unsubscribeCommand = (
  bot: Telegraf,
  subscriberRepository: ISubscriberRepository
) => {
  const logger = GetLogger("UnsubscribeCommand");

  const handleUnsubscribe = async (ctx: Context) => {
    try {
      if (!ctx.from) {
        return ctx.reply("Couldn't get user info.");
      }

      // Buton tıklaması ise yükleme ikonunu durdur
      if (ctx.callbackQuery) {
        await ctx.answerCbQuery();
      }

      await subscriberRepository.unsubscribe(ctx.from.id);

      logger.info("Unsubscribed. User ID:", { userId: ctx.from.id });
      await ctx.reply("Unsubscribed 🔕");
    } catch (error) {
      logger.error("Unsubscribe error:", error);
      await ctx
        .reply("An error occurred while unsubscribing.")
        .catch((err) => logger.error("Reply error:", err));
    }
  };

  // Listen both /unsubscribe command and unsubscribe button event
  bot.command("unsubscribe", handleUnsubscribe);
  bot.action("unsubscribe_action", handleUnsubscribe);
};