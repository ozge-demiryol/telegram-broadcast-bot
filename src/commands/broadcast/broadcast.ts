import { Telegraf } from "telegraf";
import { ISubscriberRepository } from "../../repositories/ISubscriberRepository";
import { BroadcastWorker } from "./BroadcastWorker";
import { IBroadcastRepository } from "@/repositories/broadcast/IBroadcastRepository";
import { GetLogger } from "../../infrastructure/logger";

export const broadcastCommand = (
  bot: Telegraf,
  subscriberRepository: ISubscriberRepository,
  broadcastRepository: IBroadcastRepository,
  broadcastWorker: BroadcastWorker
) => {
  const logger = GetLogger("BroadcastCommand");
  // Listener for the message to be broadcasted
  bot.on("message", async (ctx) => {
    try {
      const user = await subscriberRepository.findByTelegramId(ctx.from!.id);
      if (!user?.isAdmin) {
        await ctx.reply("Only admins can broadcast.");
        return;
      }

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
      } 
    } catch (error) {
      logger.error("Error occured while starting broadcast", error);
      await ctx.reply("An error occurred while processing your request.");
    }
  });
};
