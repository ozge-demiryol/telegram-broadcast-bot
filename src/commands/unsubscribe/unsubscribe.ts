import { GetLogger } from "../../infrastructure/logger";
import { Telegraf } from "telegraf";
import { ISubscriberRepository } from "@/repositories/ISubscriberRepository";

export const unsubscribeCommand = (
  bot: Telegraf,
  subscriberRepository: ISubscriberRepository
) => {
  const logger = GetLogger("UnsubscribeCommand");

  bot.command("unsubscribe", async (ctx) => {
    try {
      if (!ctx.from) {
        return ctx.reply("Couldn't get user info.");
      }

      await subscriberRepository.unsubscribe(ctx.from.id);

      logger.info("Unsubscribed. User ID:", { userId: ctx.from.id });
      await ctx.reply("Unsubscribed");
    } catch (error) {
      logger.error("Unsubscribe error:", error);
      await ctx
        .reply("An error occurred while unsubscribing.")
        .catch((err) => logger.error("Reply error:", err));
    }
  });
};
