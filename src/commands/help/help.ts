import { Context, Telegraf } from "telegraf";

export const helpCommand = (bot: Telegraf) => {

  const sendHelpResponse = async (ctx: Context) => {
    const helpText = `
📋 *Available Commands:*

/subscribe - Subscribe to receive broadcasts
/unsubscribe - Unsubscribe from broadcasts
/help - Show this help message

How to use:

1. To subscribe, simply press Subscribe button or send /subscribe command.
2. To unsubscribe, simply press Unsubscribe button or send /unsubscribe command.
    `.trim();

    try {
      if (ctx.callbackQuery) {
        await ctx.answerCbQuery();
      }

      await ctx.reply(helpText, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("Error sending help message:", error);
    }
  };

  bot.command("help", sendHelpResponse);
  bot.action("help_action", sendHelpResponse);
};