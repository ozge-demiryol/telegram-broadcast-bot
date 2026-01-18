import { Telegraf } from "telegraf";
import { BroadcastWorker } from "../broadcast/BroadcastWorker";
import { ISubscriberRepository } from "../../repositories/ISubscriberRepository";

export const speedCommand = (
  bot: Telegraf,
  broadcastWorker: BroadcastWorker,
  subscriberRepository: ISubscriberRepository
) => {
  bot.command("speed", async (ctx) => {
    try {
      const user = await subscriberRepository.findByTelegramId(ctx.from!.id);
      if (!user?.isAdmin) {
        await ctx.reply("Only admins can manage speed settings.");
        return;
      }

      const parts = ctx.message.text.trim().split(/\s+/);

      if (parts.length === 1) {
        const currentSpeed = broadcastWorker.getSpeed();
        await ctx.reply(
          `📊 Current sending speed: **${currentSpeed} messages/second**\n\nTo change speed, use: \`/speed <number>\``,
          { parse_mode: "Markdown" }
        );
        return;
      }

      const requestedSpeed = parseFloat(parts[1]);

      if (isNaN(requestedSpeed)) {
        await ctx.reply("Please enter a valid number.");
        return;
      }

      const result = broadcastWorker.setSpeed(requestedSpeed);

      await ctx.reply(result.message, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("Speed command error:", error);
      await ctx.reply("An error occurred while processing the command.");
    }
  });
};
