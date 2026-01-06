import { Database } from "../../infrastructure/database";
import { Telegraf } from "telegraf";
import { Logger } from "../../infrastructure/logger";
import { ISubscriberRepository } from "@/repositories/ISubscriberRepository";

export const subscribeCommand = (
  bot: Telegraf,
  subscriberRepository: ISubscriberRepository
) => {
  bot.command("subscribe", async (ctx) => {
    try {
      if (!ctx.from) {
        return ctx.reply("Couldn't get user info.");
      }

      await subscriberRepository.subscribe(
        ctx.from.id,
        ctx.from.username || "",
        false
      );

      Logger.info("Subscribed. User ID:", { userId: ctx.from.id });
      await ctx.reply("Subscribed! 🎉");
    } catch (error) {
      Logger.error("Subscribe error:", error);
      await ctx
        .reply("An error occurred while subscribing.")
        .catch((err) => Logger.error("Reply error:", err));
    }
  });
};
