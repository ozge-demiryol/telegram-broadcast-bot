import { Telegraf } from "telegraf";
import { ISubscriberRepository } from "../../repositories/ISubscriberRepository";
import { BroadcastWorker } from "./BroadcastWorker";
import { IBroadcastRepository } from "@/repositories/broadcast/IBroadcastRepository";

export const broadcastCommand = (
  bot: Telegraf,
  subscriberRepository: ISubscriberRepository,
  broadcastRepository: IBroadcastRepository,
  broadcastWorker: BroadcastWorker
) => {
  // Listener for the message to be broadcasted
  bot.on("message", async (ctx) => {
    const user = await subscriberRepository.findByTelegramId(ctx.from!.id);
    if (!user?.isAdmin) {
      await ctx.reply("Only admins can broadcast.");
      return;
    }

    //TODO: Remove it before deploying
    //const subscribers = [1350947148, 784765731];

    //STEP 1: Check ongoing broadcasts
    const ongoing = await broadcastRepository.getOngoingBroadcasts();
    const isOngoing = ongoing.length > 0;

    //STEP 2: Add new broadcast into the queue
    await broadcastRepository.createBroadcast(
      ctx.from.id,
      ctx.message.message_id,
      ctx.chat.id
    );

    await broadcastWorker.enqueue(
      ctx.from.id,
      ctx.message.message_id,
      ctx.chat.id
    );

    if (isOngoing) {
      await ctx.reply(
        "⚠️ There is an ongoing broadcast right now. Your request has been queued, and will start after the current one finishes."
      );
    } else {
      await ctx.reply("Broadcast started");
    }
  });
};
