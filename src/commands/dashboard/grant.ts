import { Telegraf } from "telegraf";
import { ISubscriberRepository } from "../../repositories/ISubscriberRepository";

export const grantCommand = (
  bot: Telegraf,
  subscriberRepository: ISubscriberRepository
) => {
  bot.command("grant", async (ctx) => {
    const isAdmin = await subscriberRepository.isAdmin(ctx.from!.id);
    if (!isAdmin) {
      return ctx.reply("Access denied. Admin only.");
    }

    const username = ctx.payload?.trim().replace(/^@/, "");
    if (!username) {
      return ctx.reply("Usage: /grant <username> or /grant @username");
    }

    const targetUser = await subscriberRepository.findByUsername(username);
    if (!targetUser) {
      return ctx.reply("User not found.");
    }

    if (targetUser.isAdmin) {
      return ctx.reply("User is already an admin.");
    }

    await subscriberRepository.setAdminStatus(targetUser.telegramId, true);
    return ctx.reply(`✅ Admin privileges granted to @${username}`);
  });
};
