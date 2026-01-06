import { Telegraf } from "telegraf";
import { broadcastService } from "./broadcast.service";
import { Logger } from "../../infrastructure/logger";
import { ISubscriberRepository } from "../../repositories/ISubscriberRepository";

export const broadcastCommand = (
  bot: Telegraf,
  subscriberRepository: ISubscriberRepository
) => {
  bot.command("broadcast", async (ctx) => {
    const message = ctx.payload?.trim();

    if (!message) {
      return ctx.reply(
        "Please provide a message to broadcast. Example: /broadcast Hello!"
      );
    }

    const user = await subscriberRepository.findByTelegramId(ctx.from!.id);

    if (!user?.isAdmin) {
      return ctx.reply("Only admins can broadcast");
    }

    const subscribers = [1350947148, 1350947148, 1350947148, 1350947148];

    await ctx.reply(`Broadcast started to ${subscribers.length} users.`);

    broadcastService.broadcast(bot, subscribers, message).catch((error) => {
      Logger.error("Broadcast error:", error);
      ctx
        .reply("An error occurred during broadcast.")
        .catch((err) => Logger.error("Reply error:", err));
    });
  });
};
