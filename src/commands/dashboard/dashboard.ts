import { Telegraf } from "telegraf";
import { ISubscriberRepository } from "../../repositories/ISubscriberRepository";

export const dashboardCommand = (
  bot: Telegraf,
  subscriberRepository: ISubscriberRepository
) => {
  bot.command("dashboard", async (ctx) => {
    const user = await subscriberRepository.findByTelegramId(ctx.from!.id);
    if (!user?.isAdmin) {
      return ctx.reply("Access denied. Admin only.");
    }

    const menu = `
🎛️ *Admin Dashboard*

Available commands:
• /grant <username> - Grant admin privileges
• /revoke <username> - Revoke admin privileges
• /speed - Show current message sending speed
• /speed <number> - Set message sending speed (messages per second)
• /stats - View bot statistics
• /setWelcome - Set greeting message

Use these commands to manage the bot.
    `.trim();

    return ctx.reply(menu, { parse_mode: "Markdown" });
  });
};
