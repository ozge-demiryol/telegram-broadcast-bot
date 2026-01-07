import pLimit from "p-limit";
import { Telegraf } from "telegraf";
import { Logger } from "../../infrastructure/logger";
import { CONFIG } from "../../config/config";
import { ISubscriberRepository } from "@/repositories/ISubscriberRepository";

export class BroadcastService {
  async handleBroadcast(
    bot: Telegraf,
    userIds: number[],
    message: string,
    subscriberRepository: ISubscriberRepository
  ) {
    const limit = pLimit(CONFIG.TELEGRAM.CONCURRENT_REQUESTS);
    let isPaused = false;

    // Calculate delay to stay under the 25 msgs/sec limit
    // 1000ms / 25 = 40ms interval minimum
    const delay = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    Logger.info(`Starting broadcast to ${userIds.length} users...`);

    const tasks = userIds.map((userId, index) => {
      return limit(async () => {
        try {
          // Add a small staggered delay based on the index to respect the rate limit
          await delay(index * (1000 / CONFIG.TELEGRAM.RATE_LIMIT));

          await bot.telegram.sendMessage(userId, message);
        } catch (error: any) {
          if (error.response?.error_code === 403) {
            Logger.warn(
              `User ${userId} blocked the bot. Mark as inactive in DB.`
            );
            await subscriberRepository.unsubscribe(userId);
          }
          if (error.response?.error_code === 429) {
            const retryAfter =
              (error.response.parameters?.retry_after || 5) * 1000;
            isPaused = true;

            Logger.warn(`RATE LIMIT HIT. Pausing for ${retryAfter / 1000}s...`);
            await delay(retryAfter);

            isPaused = false;
            // Retry this specific user message once more
            await bot.telegram.sendMessage(userId, message);
          } else {
            Logger.error(
              `Failed to send broadcast to ${userId}:`,
              error.message
            );
          }
        }
      });
    });

    // Execute all tasks. Promise.allSettled ensures one failure doesn't stop the whole loop.
    await Promise.allSettled(tasks);

    Logger.info("Broadcast sequence completed.");
  }

  async broadcast(bot: Telegraf, chatIds: number[], message: string) {
    const limit = pLimit(CONFIG.TELEGRAM.CONCURRENT_REQUESTS);
    // Send message to subscribers in background without hitting Telegram's limits
    const tasks = chatIds.map((chatId) =>
      limit(() => this.sendMessage(bot, chatId, message))
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
