import { Telegraf } from "telegraf";
import { ISubscriberRepository } from "../../repositories/ISubscriberRepository";
import { redisRepository } from "../../repositories/redis/redisRepository";
import { broadcastQueue } from "./broadcast.queue";
import { Pool } from "mysql2/typings/mysql/lib/Pool";
import { PoolConnection } from "mysql2/typings/mysql/lib/PoolConnection";

export const broadcastCommand = (
  bot: Telegraf,
  subscriberRepository: ISubscriberRepository
) => {
  bot.command("broadcast", async (ctx) => {
    const isAdmin = await subscriberRepository.isAdmin(ctx.from!.id);
    if (!isAdmin) {
      return ctx.reply("Only admins can broadcast");
    }

    return ctx.reply(
      "Please *send* or *forward* the message (text/media) to broadcast.",
      { parse_mode: "Markdown" }
    );
  });

  // Listener for the message to be broadcasted
  bot.on("message", async (ctx) => {
    const isAdmin = await subscriberRepository.isAdmin(ctx.from!.id);
    if (!isAdmin) {
      return ctx.reply("Only admins can broadcast");
    }

    //const subscribers = await subscriberRepository.findAllActive();
    const subscribers = await PoolConnection.createQuery(
      "SELECT telegramId FROM subscribers WHERE isActive = 1"
    ).stream();

    //TODO: Remove it before deploying
    //const subscribers = [1350947148, 784765731];

    await ctx.reply(`Broadcasting to ${subscribers.readableLength} users...`);
  });
};
