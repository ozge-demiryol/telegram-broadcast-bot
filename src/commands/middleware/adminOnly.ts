import { Context } from "telegraf";
import { ISubscriberRepository } from "../../repositories/ISubscriberRepository";

// Telegram delivers a button press from anyone who can see the keyboard (an old admin's
// chat, a group), so button handlers need their own admin check, just like commands.
export const adminOnlyAction =
  (subscriberRepository: ISubscriberRepository) =>
  async (ctx: Context, next: () => Promise<void>) => {
    const user = ctx.from && (await subscriberRepository.findByTelegramId(ctx.from.id));
    if (!user?.isAdmin) {
      await ctx.answerCbQuery("Only admins can use this button.", { show_alert: true });
      return;
    }
    return next();
  };
