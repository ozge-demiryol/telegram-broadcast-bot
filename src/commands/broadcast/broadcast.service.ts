import pLimit from "p-limit";
import { Telegraf } from "telegraf";
import { Logger } from "../../infrastructure/logger";
import { CONFIG } from "../../config/config";

export class BroadcastService {
  private limit = pLimit(CONFIG.TELEGRAM.CONCURRENT_REQUESTS);

  async broadcast(bot: Telegraf, chatIds: number[], message: string) {
    // Send message to subscribers in background without hitting Telegram's limits
    const tasks = chatIds.map((chatId) =>
      this.limit(() => this.sendMessage(bot, chatId, message))
    );

    await Promise.all(tasks)
      .then(() => {
        Logger.info("Broadcasting successfully completed.");
      })
      .catch((err) => {
        Logger.error("Error occurred during broadcasting:", err);
      });
  }

  private async sendMessage(
    bot: Telegraf,
    chatId: number,
    text: string
  ): Promise<void> {
    try {
      await bot.telegram.sendMessage(chatId, text);
      //Wait to respect rate limit
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 / CONFIG.TELEGRAM.RATE_LIMIT)
      );
    } catch (error: any) {
      if (error.response?.error_code === 403) {
        Logger.info("User has blocked the bot", { chatId });
      } else if (error.response?.error_code === 429) {
        const retryAfter = error.response.parameters.retry_after || 1;
        Logger.warn("Rate limit hit! Waiting seconds...", { retryAfter });
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
        return this.sendMessage(bot, chatId, text); // Retry
      }
    }
  }
}

export const broadcastService = new BroadcastService();
