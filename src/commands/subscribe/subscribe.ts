import { Telegraf } from "telegraf";
import { GetLogger } from "../../infrastructure/logger";
import { ISubscriberRepository } from "@/repositories/ISubscriberRepository";

export const subscribeCommand = (
  bot: Telegraf,
  subscriberRepository: ISubscriberRepository
) => {
  const logger = GetLogger("SubscribeCommand");
  bot.command("subscribe", async (ctx) => {
    try {
      if (!ctx.from) {
        return ctx.reply("Couldn't get user info.");
      }

      const stats = await subscriberRepository.getSubscriberStats();
      const isAdmin = stats.total === 0;

      await subscriberRepository.subscribe(
        ctx.from.id,
        ctx.from.username || "",
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
  });
};
