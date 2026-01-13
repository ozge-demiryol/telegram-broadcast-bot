import Bottleneck from "bottleneck";
import StatusCodes from "http-status-codes";
import { IMessenger } from "../../infrastructure/telegram/IMessenger";
import { ISubscriberRepository } from "../../repositories/ISubscriberRepository";
import { Logger } from "../../infrastructure/logger";
import { CONFIG } from "@/config/config";

export class BroadcastWorker {
  private limiter: Bottleneck;
  private queue: any[] = [];
  private isProcessing = false;
  private chunkSize = CONFIG.TELEGRAM.RATE_LIMIT;

  constructor(
    private messenger: IMessenger,
    private subscriberRepo: ISubscriberRepository,
    private db: any
  ) {
    this.limiter = new Bottleneck({
      minTime: 200, //approx. 6-7 messages per second
      maxConcurrent: 1,
    });

    this.setupErrorHandlers();
  }

  private setupErrorHandlers() {
    this.limiter.on("failed", async (error, jobInfo) => {
      const id = jobInfo.options.id;

      // 1. Handle 429 Too Many Requests
      if (error.response?.error_code === StatusCodes.TOO_MANY_REQUESTS) {
        const retryAfter = error.response.parameters?.retry_after || 60;
        const waitTime = retryAfter * 1000 + 5000; // Extra generous buffer
        Logger.warn(
          `[Spam Guard] Rate limit at ${id}. Cooling down for ${waitTime} ms...`
        );
        return waitTime;
      }

      // 2. Handle Timeouts & Network Flaps
      if (error.name === "TimeoutError" || error.code === "ETIMEDOUT") {
        Logger.error(`[Network] Timeout at ${id}. Waiting 7s before retry.`);
        return 7000;
      }

      return null;
    });
  }

  public async enqueue(adminId: number, messageId: number, chatId: number) {
    this.queue.push({
      admin_id: adminId,
      message_id: messageId,
      chat_id: chatId,
    });
    if (!this.isProcessing) {
      this.processQueue().catch((err) =>
        Logger.error("[Critical] Queue crash prevented", err)
      );
    }
  }

  private async processQueue() {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }
    this.isProcessing = true;
    const currentJob = this.queue.shift();
    try {
      await this.runBroadcast(currentJob);
    } finally {
      this.isProcessing = false;
      if (this.queue.length > 0) await this.processQueue();
    }
  }

  private async runBroadcast(job: any) {
    const subscribers = await this.subscriberRepo.findAllActive();

    //TODO: FOR STRESS TESTING ONLY. Remove it before deploying
    const stressTestData = Array.from({ length: 500 }, () => subscribers[0]);

    const total = stressTestData.length;
    let sentCount = 0;
    let failedCount = 0;
    let blockedCount = 0;

    Logger.info(`[Broadcast] Safety protocol initiated for ${total} users.`);

    for (let i = 0; i < total; i++) {
      const subscriber = stressTestData[i];
      const currentIndex = i + 1;

      try {
        await this.limiter.schedule({ id: `msg-${currentIndex}` }, async () => {
          await this.messenger.copyMessage(
            subscriber.telegramId,
            job.chat_id,
            job.message_id
          );
          Logger.debug(
            `[BroadcastWorker] - [${currentIndex} / ${total}] Sending to: ${subscriber.telegramId} from: ${job.chat_id} msgId: ${job.message_id}`
          );
          sentCount++;
        });
      } catch (error: any) {
        // SPAM PROTECTION: If user blocked the bot (403), remove them from DB immediately
        if (error.response?.error_code === StatusCodes.FORBIDDEN) {
          blockedCount++;
          await this.subscriberRepo.setActiveStatus(
            subscriber.telegramId,
            false
          );
          Logger.debug(
            `[Pruning] User ${subscriber.telegramId} marked as inactive (Blocked bot).`
          );
        } else {
          failedCount++;
          Logger.error(`[Error] msg-${currentIndex}: ${error.message}`);
        }
      }

      // OPTIMIZED CHUNKING: 25 msg / 2s pause
      if (currentIndex % this.chunkSize === 0 && currentIndex < total) {
        await new Promise((res) => setTimeout(res, 2000));

        // ADAPTIVE REPORTING: Only notify admin every 500 messages to prevent 429 on admin chat
        if (currentIndex % 500 === 0) {
          this.reportProgress(
            job.admin_id,
            sentCount,
            failedCount,
            blockedCount
          ).catch(() => {});
        }
      }
    }

    await this.messenger.sendMessage(
      job.admin_id,
      `✅ Broadcast Finished\nSent: ${sentCount}\nBlocked/Pruned: ${blockedCount}\nErrors: ${failedCount}`
    );
  }

  private async reportProgress(
    adminId: number,
    sent: number,
    failed: number,
    blocked: number
  ) {
    // Reporting is now async and safe
    const totalProcessed = sent + failed + blocked;
    await this.messenger.sendMessage(
      adminId,
      `📊 Progress: ${totalProcessed} users reached. (Cleaned: ${blocked})`
    );
  }
}
