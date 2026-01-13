import { Telegraf } from "telegraf";

export const helpCommand = (bot: Telegraf) => {
  bot.command("help", async (ctx) => {
    const helpText = `
📋 *Available Commands:*

/subscribe - Subscribe to receive broadcasts
/unsubscribe - Unsubscribe from broadcasts
/help - Show this help message
/dashboard - Show admin dashboard (Admin only)

How to use:

1. To subscribe, simply send /subscribe.
2. To share a text or media (photo, video, document), simply send it to the bot (admins only).
    `.trim();

    await ctx.reply(helpText, { parse_mode: "Markdown" });
  });
};
