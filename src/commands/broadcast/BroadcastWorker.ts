import Bottleneck from "bottleneck";
import StatusCodes from "http-status-codes";
import { IMessenger } from "../../infrastructure/telegram/IMessenger";
import { ISubscriberRepository } from "../../repositories/ISubscriberRepository";
import { GetLogger } from "../../infrastructure/logger";
import { CONFIG } from "../../config/config";
import { IBroadcastRepository } from "../../repositories/broadcast/IBroadcastRepository";
import { Subscriber } from "../../repositories/Subscriber";

export class BroadcastWorker {
  private limiter: Bottleneck;
  private queue: any[] = [];
  private isProcessing = false;
  private chunkSize = CONFIG.TELEGRAM.CHUNK_SIZE;
  private minTime = CONFIG.TELEGRAM.MIN_TIME;
  private pageSize = CONFIG.TELEGRAM.PAGE_SIZE;
  private logger = GetLogger("BroadcastWorker");

  constructor(
    private messenger: IMessenger,
    private subscriberRepo: ISubscriberRepository,
    private broadcastRepo: IBroadcastRepository
  ) {
    this.limiter = new Bottleneck({
      minTime: this.minTime,
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
        this.logger.warn(
          `[Spam Guard] Rate limit at ${id}. Cooling down for ${waitTime} ms...`
        );
        return waitTime;
      }

      // 2. Handle Timeouts & Network Flaps
      if (error.name === "TimeoutError" || error.code === "ETIMEDOUT") {
        this.logger.error(
          `[Network] Timeout at ${id}. Waiting 7s before retry.`
        );
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
        this.logger.error("[Critical] Queue crash prevented", err)
      );
    }
  }

  private async processQueue() {
    const nextJob = await this.broadcastRepo.getNextPendingBroadcast();

    if (!nextJob) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;

    const startTime = performance.now();

    try {
      await this.broadcastRepo.updateStatus(nextJob.id, "processing");

      await this.runBroadcast_v2(nextJob, startTime);

      await this.broadcastRepo.updateStatus(nextJob.id, "completed");
    } catch (error) {
      this.logger.error(`[BroadcastWorker] Job ${nextJob.id} failed`, error);
    } finally {
      if (this.queue.length > 0) {
        this.queue.shift(); // Clean the queue
      }
      await this.processQueue();
    }
  }

  private async runBroadcast(job: any, startTime: number) {
    let sentCount = 0;
    let failedCount = 0;
    let blockedCount = 0;

    const subscribers = await this.subscriberRepo.getSubscribers();

    const total = subscribers.length;

    this.logger.info(`[Broadcast] Broadcast started for ${total} users.`);

    for (let i = 0; i < total; i++) {
      const subscriber = subscribers[i];
      const currentIndex = i + 1;

      try {
        await this.limiter.schedule({ id: `msg-${currentIndex}` }, async () => {
          await this.messenger.copyMessage(
            subscriber.telegramId,
            job.chat_id,
            job.message_id
          );
          this.logger.debug(
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
          this.logger.debug(
            `[Pruning] User ${subscriber.telegramId} marked as inactive (Blocked bot).`
          );
        } else {
          failedCount++;
          this.logger.error(`[Error] msg-${currentIndex}: ${error.message}`);
        }
      }

      // OPTIMIZED CHUNKING: 25 msg / 2s pause
      if (currentIndex % this.chunkSize === 0 && currentIndex < total) {
        this.logger.info(
          `[BroadcastWorker] Chunking pause at ${currentIndex} / ${total}`
        );

        await new Promise((res) => setTimeout(res, 2000));

        // ADAPTIVE REPORTING: Only notify admin every 500 messages to prevent 429 on admin chat
        if (currentIndex % 500 === 0) {
          this.reportProgress(
            job.admin_id,
            sentCount,
            failedCount,
            blockedCount
          ).catch((error) => {
            this.logger.error(
              "[BroadcastWorker] Failed to report progress to admin",
              error
            );
          });
        }
      }
    }

    const endTime = performance.now();
    const durationInMinutes = Math.floor((endTime - startTime) / 60000);
    const durationInSeconds = Math.floor(
      ((endTime - startTime) % 60000) / 1000
    );
    const durationMessage = `${durationInMinutes}m ${durationInSeconds}s`;

    await this.messenger.sendMessage(
      job.admin_id,
      `✅ Broadcast Finished\nSent: ${sentCount}\nBlocked/Pruned: ${blockedCount}\nErrors: ${failedCount}\nDuration: ${durationMessage}`
    );

    this.logger.info(
      `[Broadcast] Broadcast finished for ${total} users. Duration: ${durationMessage}`
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
      `📊 Progress: ${totalProcessed} users reached`
    );
  }

  private async runBroadcast_v2(job: any, startTime: number) {
    let sentCount = 0;
    let failedCount = 0;
    let blockedCount = 0;
    //For pagination
    const PAGE_SIZE = this.pageSize;
    let hasMore = true;
    let lastId = 0;
    let currentIndex = 0;

    let totalUsers = await this.subscriberRepo.countTotalSubcribers();
    //TODO: FOR STRESS TESTING ONLY. Remove it before deploying
    // const subscribers = await this.subscriberRepo.getSubscribers();
    // const stream = Array.from({ length: 100 }, () => subscribers[0]);
    // totalUsers = stream.length;

    this.logger.info(`[Broadcast] Broadcast started for ${totalUsers} users.`);

    while (hasMore) {
      let batchSize = 0;

      const stream = this.subscriberRepo.getSubscribersStream(
        lastId,
        PAGE_SIZE
      );

      for await (const row of stream) {
        const subscriber = row as Subscriber;
        batchSize++;
        currentIndex++;
        lastId = subscriber.id;

        this.logger.debug(`[BroadcastWorker] - Batch size: ${batchSize}`);

        try {
          await this.limiter.schedule(
            { id: `msg-${currentIndex}` },
            async () => {
              await this.messenger.copyMessage(
                subscriber.telegramId,
                job.chat_id,
                job.message_id
              );
              this.logger.debug(
                `[BroadcastWorker] - [${currentIndex} / ${totalUsers}] Sent: ${subscriber.telegramId}`
              );
              sentCount++;
            }
          );

          if (
            currentIndex % this.chunkSize === 0 &&
            currentIndex < totalUsers
          ) {
            this.logger.info(
              `[BroadcastWorker] Chunking pause at ${currentIndex}`
            );
            await new Promise((res) => setTimeout(res, 2000));

            if (currentIndex % 500 === 0) {
              this.reportProgress(
                job.admin_id,
                sentCount,
                failedCount,
                blockedCount
              ).catch((error) => {
                this.logger.error(
                  "[BroadcastWorker] Failed to report progress to admin",
                  error
                );
              });
            }
          }
        } catch (error: any) {
          if (error.response?.error_code === StatusCodes.FORBIDDEN) {
            blockedCount++;
            await this.subscriberRepo.setActiveStatus(
              subscriber.telegramId,
              false
            );
            this.logger.debug(
              `[Pruning] User ${subscriber.telegramId} marked as inactive.`
            );
          } else {
            failedCount++;
            this.logger.error(`[Error] msg-${currentIndex}: ${error.message}`);
          }
        }
      }

      if (batchSize === 0 || batchSize < PAGE_SIZE) {
        hasMore = false;
      }
    }

    const endTime = performance.now();
    const durationInMinutes = Math.floor((endTime - startTime) / 60000);
    const durationInSeconds = Math.floor(
      ((endTime - startTime) % 60000) / 1000
    );
    const durationMessage = `${durationInMinutes}m ${durationInSeconds}s`;

    await this.messenger.sendMessage(
      job.admin_id,
      `✅ Broadcast Finished\nSent: ${sentCount}\nBlocked/Pruned: ${blockedCount}\nErrors: ${failedCount}\nDuration: ${durationMessage}`
    );

    this.logger.info(
      `[Broadcast] Broadcast finished for ${totalUsers} users. Duration: ${durationMessage}`
    );
  }
}
