import { Telegraf, Markup } from "telegraf";
import { ISubscriberRepository } from "../../repositories/ISubscriberRepository";
import { BroadcastWorker } from "./BroadcastWorker";
import { IBroadcastRepository } from "@/repositories/broadcast/IBroadcastRepository";
import { GetLogger } from "../../infrastructure/logger";
import { adminOnlyAction } from "../middleware/adminOnly";

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

  bot.action(/^confirm_bc_(\d+)$/, adminOnlyAction(subscriberRepository), async (ctx) => {
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
      const created = await broadcastRepository.createBroadcast(userId, messageId, chatId);
      if (!created) {
        await ctx.answerCbQuery("This message is already queued or was already broadcast.", { show_alert: true });
        return;
      }
      broadcastWorker.wake();

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
  bot.action("cancel_bc", adminOnlyAction(subscriberRepository), async (ctx) => {
    try {
      await ctx.editMessageText("❌ Broadcast request has been cancelled.");
      await ctx.answerCbQuery("Cancelled.");
    } catch (error) {
      logger.error("Error occurred while cancelling broadcast:", error);
      await ctx.answerCbQuery("An error occurred.");
    }
  });

  // Listener for the 'Stop Broadcast' button click.
  // Buttons sent before the id was added mean "the one running now".
  bot.action(/^stop_broadcast(?:_(\d+))?$/, adminOnlyAction(subscriberRepository), async (ctx) => {
    try {
      const jobId = ctx.match[1] ? parseInt(ctx.match[1]) : broadcastWorker.runningJobId;

      // Cancel in the database first, so the job does not come back after a restart
      if (jobId === null || !(await broadcastRepository.cancel(jobId))) {
        await ctx.reply("⚠️ Broadcast already finished. You cannot stop a completed broadcast");
        await ctx.answerCbQuery("Broadcast already finished.");
        return;
      }

      broadcastWorker.stopBroadcast(jobId);
      await ctx.reply("🛑 Stopping broadcast...");
      await ctx.answerCbQuery("Stopping...");
    } catch (error) {
      logger.error("Error stopping broadcast", error);
      await ctx.reply("Failed to stop broadcast.");
    }
  });
};
