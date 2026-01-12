import { Telegraf } from "telegraf";
import { ISubscriberRepository } from "../../repositories/ISubscriberRepository";
import { BroadcastWorker } from "./BroadcastWorker";

export const broadcastCommand = (
  bot: Telegraf,
  subscriberRepository: ISubscriberRepository,
  broadcastWorker: BroadcastWorker
) => {
  bot.command("broadcast", async (ctx) => {
    const user = await subscriberRepository.findByTelegramId(ctx.from!.id);
    if (!user?.isAdmin) {
      return ctx.reply("Only admins can broadcast");
    }

    return ctx.reply(
      "Please *send* or *forward* the message (text/media) to broadcast.",
      { parse_mode: "Markdown" }
    );
  });

  // Listener for the message to be broadcasted
  bot.on("message", async (ctx) => {
    const user = await subscriberRepository.findByTelegramId(ctx.from!.id);
    if (!user?.isAdmin) {
      return;
    }

    //TODO: Remove it before deploying
    //const subscribers = [1350947148, 784765731];

    await broadcastWorker.enqueue(
      ctx.from.id,
      ctx.message.message_id,
      ctx.chat.id
    );
    await ctx.reply("Broadcast queued. Processing started...");
  });
};
