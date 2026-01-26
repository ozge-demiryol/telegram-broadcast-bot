import { Telegraf } from "telegraf";
import { BroadcastWorker } from "../broadcast/BroadcastWorker";
import { ISubscriberRepository } from "../../repositories/ISubscriberRepository";
import { GetLogger } from "../../infrastructure/logger";

export const statsCommand = (
  bot: Telegraf,
  broadcastWorker: BroadcastWorker,
  subscriberRepository: ISubscriberRepository
) => {
  const logger = GetLogger("StatsCommand");
  bot.command("stats", async (ctx) => {
    try {
      const user = await subscriberRepository.findByTelegramId(ctx.from!.id);
      if (!user?.isAdmin) {
        await ctx.reply("Only admins can view statistics.");
        return;
      }
      const currentSpeed = await broadcastWorker.getSpeed();
      const counts = await subscriberRepository.getSubscriberStats();

      const message = `
**System Statistics**

**Speed:** ${currentSpeed} msg/sec

**Subscribers:**
• Total: ${counts.total}
• Active: ${counts.active}
• Inactive: ${counts.inactive}
      `.trim();

      await ctx.reply(message, { parse_mode: "Markdown" });
    } catch (error) {
      logger.error("Stats command error:", error);
      await ctx.reply("An error occurred while fetching statistics.");
    }
  });
};
