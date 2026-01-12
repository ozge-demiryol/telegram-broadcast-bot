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

    //const subscribers = await subscriberRepository.findAllActive();
    //TODO: Remove it before deploying
    //const subscribers = [1350947148, 784765731];
    //const broadcastId = `bc-${Date.now()}`;

    // Initialize tracking in Redis
    /*await redisRepository.hset(`broadcast:${broadcastId}`, {
      total: subscribers.length,
      sent: 0,
      failed: 0,
      startTime: new Date().toISOString(),
      adminId: ctx.from.id,
    });

    await broadcastQueue.addBulkMessages(
      subscribers.map((s) => s.telegramId),
      ctx.chat.id,
      ctx.message.message_id,
      broadcastId,
      ctx.from.id
    );*/

    //await ctx.reply(`Broadcasting to ${subscribers.length} users...`);
    await broadcastWorker.enqueue(ctx.from.id, ctx.message.message_id, ctx.chat.id);
    await ctx.reply("Broadcast queued. Processing started...");
  });
};
