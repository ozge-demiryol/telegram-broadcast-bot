import { Telegraf, Markup } from "telegraf";
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

      // Prompt for confirmation before proceeding with the broadcast
      // We pass the message_id in the callback_data to identify which message to broadcast later
      await ctx.reply("Are you sure you want to broadcast this message to all subscribers?", {
        reply_parameters: { message_id: ctx.message.message_id },
        ...Markup.inlineKeyboard([
          Markup.button.callback("✅ Confirm", `confirm_bc_${ctx.message.message_id}`),
          Markup.button.callback("❌ Cancel", "cancel_bc")
        ])
      });
    } catch (error) {
      logger.error("Error occured while starting broadcast", error);
      await ctx.reply("An error occurred while processing your request.");
    }
  });

  bot.action(/^confirm_bc_(\d+)$/, async (ctx) => {
    try {
      const messageId = parseInt(ctx.match[1]);
      const userId = ctx.from!.id;
      const chatId = ctx.chat!.id;

      // Edit the confirmation message to prevent multiple clicks and provide feedback
      await ctx.editMessageText("Starting the broadcast process...");

      // STEP 1: Check ongoing broadcasts
      const ongoing = await broadcastRepository.getOngoingBroadcasts();
      const isOngoing = ongoing.length > 0;

      // STEP 2: Add new broadcast into the queue
      await broadcastRepository.createBroadcast(userId, messageId, chatId);
      await broadcastWorker.enqueue(userId, messageId, chatId);

      if (isOngoing) {
        await ctx.reply(
          "⚠️ There is an ongoing broadcast right now. Your request has been queued and will start after the current one finishes."
        );
      }

      // Acknowledge the callback to remove the loading state on the button
      await ctx.answerCbQuery("Broadcast confirmed.");

    } catch (error) {
      logger.error("Error occurred while confirming broadcast:", error);
      await ctx.answerCbQuery("An error occurred.");
    }
  });

  // Listener for the 'Cancel' button click
  bot.action("cancel_bc", async (ctx) => {
    try {
      await ctx.editMessageText("❌ Broadcast request has been cancelled.");
      await ctx.answerCbQuery("Cancelled.");
    } catch (error) {
      logger.error("Error occurred while cancelling broadcast:", error);
      await ctx.answerCbQuery("An error occurred.");
    }
  });

  // Listener for the 'Stop Broadcast' button click
  bot.action("stop_broadcast", async (ctx) => {
    try {
      if (!broadcastWorker.isAnyBroadcastRunning()) {
        await ctx.reply("⚠️ Broadcast already finished. You cannot stop a completed broadcast");
        await ctx.answerCbQuery("Broadcast already finished.");
        return;
      }

      broadcastWorker.stopBroadcast();
      await ctx.reply("🛑 Stopping broadcast...");
      await ctx.answerCbQuery("Stopping...");
    } catch (error) {
      logger.error("Error stopping broadcast", error);
      await ctx.reply("Failed to stop broadcast.");
    }
  });
};
