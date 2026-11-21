import { Telegraf } from "telegraf";
import { ISubscriberRepository } from "../../repositories/ISubscriberRepository";

export const revokeCommand = (
  bot: Telegraf,
  subscriberRepository: ISubscriberRepository
) => {
  bot.command("revoke", async (ctx) => {
    const user = await subscriberRepository.findByTelegramId(ctx.from!.id);
    if (!user?.isAdmin) {
      return ctx.reply("Access denied. Admin only.");
    }

    const username = ctx.payload?.trim().replace(/^@/, "");
    if (!username) {
      return ctx.reply("Usage: /revoke <username> or /revoke @username");
    }

    const targetUser = await subscriberRepository.findByUsername(username);
    if (!targetUser) {
      return ctx.reply("User not found.");
    }

    if (targetUser.username === user.username) {
      return ctx.reply("You cannot revoke your own admin privileges.");
    }

    if (!targetUser.isAdmin) {
      return ctx.reply("User is not an admin.");
    }

    await subscriberRepository.setAdminStatus(targetUser.telegramId, false);
    return ctx.reply(`✅ Admin privileges revoked from @${username}`);
  });
};
