import { Telegraf } from "telegraf";
import { ISubscriberRepository } from "../../repositories/ISubscriberRepository";
import { redisRepository } from "../../repositories/redis/redisRepository";
import { broadcastQueue } from "./broadcast.queue";

export const broadcastCommand = (
  bot: Telegraf,
  subscriberRepository: ISubscriberRepository
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
    //TODO: Replace with actual subscriber IDs from DB
    const subscribers = [1350947148];
    //const subscribers = [1350947148, 784765731];
    const broadcastId = `bc-${Date.now()}`;

    // Initialize tracking in Redis
    await redisRepository.hset(`broadcast:${broadcastId}`, {
      total: subscribers.length,
      sent: 0,
      failed: 0,
      startTime: new Date().toISOString(),
      adminId: ctx.from.id,
    });

    await broadcastQueue.addBulkMessages(
      subscribers,
      ctx.chat.id,
      ctx.message.message_id,
      broadcastId,
      ctx.from.id
    );

    await ctx.reply(`Broadcasting to ${subscribers.length} users...`);
  });
};

// import { Telegraf } from "telegraf";
// import { broadcastService } from "./broadcast.service";
// import { Logger } from "../../infrastructure/logger";
// import { ISubscriberRepository } from "../../repositories/ISubscriberRepository";

// export const broadcastCommand = (
//   bot: Telegraf,
//   subscriberRepository: ISubscriberRepository
// ) => {
//   bot.command("broadcast", async (ctx) => {
//     const message = ctx.payload?.trim();

//     if (!message) {
//       return ctx.reply(
//         "Please provide a message to broadcast. Example: /broadcast Hello!"
//       );
//     }

//     const user = await subscriberRepository.findByTelegramId(ctx.from!.id);

//     if (!user?.isAdmin) {
//       return ctx.reply("Only admins can broadcast");
//     }

//     //TODO: Replace with actual subscriber IDs from DB
//     const subscribers = [1350947148, 784765731];

//     await ctx.reply(`Broadcast started to ${subscribers.length} users.`);

//     broadcastService
//       .handleBroadcast(bot, subscribers, message, subscriberRepository)
//       .catch((error) => {
//         Logger.error("Broadcast error:", error);
//         ctx
//           .reply("An error occurred during broadcast.")
//           .catch((err) => Logger.error("Reply error:", err));
//       });
//   });
// };
