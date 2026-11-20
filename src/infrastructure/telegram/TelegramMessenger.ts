import { Telegraf } from "telegraf";
import { IMessenger } from "./IMessenger";
import { CONFIG } from "../../config/config";
import { GetLogger } from "../../infrastructure/logger";

export class TelegramMessenger implements IMessenger {
  private logger = GetLogger("TelegramMessenger");
  constructor(private bot: Telegraf) { }

  async copyMessage(toChatId: number, fromChatId: number, messageId: number) {
    if (CONFIG.DRY_RUN) {
      this.logger.debug(
        `[DRY RUN] Skipping copyMessage to ${toChatId} from ${fromChatId} (msgId: ${messageId})`
      );
      return;
    }
    await this.bot.telegram.copyMessage(toChatId, fromChatId, messageId);
  }

  async sendMessage(toChatId: number, text: string, extra?: any) {
    await this.bot.telegram.sendMessage(toChatId, text, extra);
  }
}