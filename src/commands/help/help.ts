import { Telegraf } from "telegraf";

export const helpCommand = (bot: Telegraf) => {
  bot.command("help", async (ctx) => {
    const helpText = `
📋 *Available Commands:*

/subscribe - Subscribe to receive broadcasts
/unsubscribe - Unsubscribe from broadcasts
/help - Show this help message
/dashboard - Show admin dashboard (Admin only)
/broadcast - Send message to all subscribers (Admin only)
    `.trim();

    await ctx.reply(helpText, { parse_mode: "Markdown" });
  });
};
