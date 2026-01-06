import { Telegraf } from "telegraf";

export const helpCommand = (bot: Telegraf) => {
  bot.command("help", async (ctx) => {
    const helpText = `
📋 *Available Commands:*

/subscribe - Subscribe to receive broadcasts
/unsubscribe - Unsubscribe from broadcasts
/help - Show this help message
    `.trim();

    await ctx.reply(helpText, { parse_mode: "Markdown" });
  });
};
