import { Telegraf } from "telegraf";
import { IMessenger } from "./IMessenger";

export class TelegramMessenger implements IMessenger {
  constructor(private bot: Telegraf) {}

  async copyMessage(toChatId: number, fromChatId: number, messageId: number) {
    await this.bot.telegram.copyMessage(toChatId, fromChatId, messageId);
  }

  async forwardMessage(toChatId: number, fromChatId: number, messageId: number) {
    await this.bot.telegram.forwardMessage(toChatId, fromChatId, messageId);
  }

  async sendMessage(toChatId: number, text: string) {
    await this.bot.telegram.sendMessage(toChatId, text);
  }
}