import { Context, Telegraf } from "telegraf";
import { GetLogger } from "../../infrastructure/logger";
import { ISubscriberRepository } from "@/repositories/ISubscriberRepository";

export const subscribeCommand = (
  bot: Telegraf,
  subscriberRepository: ISubscriberRepository
) => {
  const logger = GetLogger("SubscribeCommand");

  const handleSubscribe = async (ctx: Context) => {
    try {
      if (!ctx.from) {
        return ctx.reply("Couldn't get user info.");
      }

      if (ctx.callbackQuery) {
        await ctx.answerCbQuery();
      }

      const stats = await subscriberRepository.getSubscriberStats();
      const isAdmin = stats.total === 0;

      const userId = ctx.from.id;
      const username = ctx.from.username;
      const firstName = ctx.from.first_name;

      const displayName = (username || firstName || `User_${userId}`).trim();

      logger.info("Subscribing user", {
        userId: ctx.from.id,
        username: displayName,
        isAdmin,
      });

      await subscriberRepository.subscribe(
        ctx.from.id,
        displayName,
        isAdmin
      );

      logger.info("Subscribed. User ID:", { userId: ctx.from.id });
      await ctx.reply("Subscribed! 🎉");
    } catch (error) {
      logger.error("Subscribe error:", error);
      await ctx
        .reply("An error occurred while subscribing.")
        .catch((err) => logger.error("Reply error:", err));
    }
  };

  // Listen both subscribe command and subscribe button event
  bot.command("subscribe", handleSubscribe);
  bot.action("subscribe_action", handleSubscribe);
};