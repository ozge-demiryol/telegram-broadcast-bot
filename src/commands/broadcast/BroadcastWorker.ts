import StatusCodes from "http-status-codes";
import { IMessenger } from "../../infrastructure/telegram/IMessenger";
import { ISubscriberRepository } from "../../repositories/ISubscriberRepository";
import { GetLogger } from "../../infrastructure/logger";
import { CONFIG } from "../../config/config";
import { IBroadcastRepository } from "../../repositories/broadcast/IBroadcastRepository";
import { Subscriber } from "../../repositories/Subscriber";
import { RateLimiterManager } from "../../infrastructure/rate-limiter/RateLimiterManager";

export class BroadcastWorker {
  private rateManager: RateLimiterManager;
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
    this.rateManager = new RateLimiterManager(this.minTime);
    this.logger.info(`[BroadcastWorker] Initialized with speed: ${this.rateManager.getSpeed()} msg/sec`);
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

      await this.runBroadcast(nextJob, startTime);

      await this.broadcastRepo.updateStatus(nextJob.id, "completed");
    } catch (error) {
      this.logger.error(`Job ${nextJob.id} failed`, error);
    } finally {
      if (this.queue.length > 0) {
        this.queue.shift(); // Clean the queue
      }
      await this.processQueue();
    }
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

  private async runBroadcast(job: any, startTime: number) {
    let sentCount = 0;
    let failedCount = 0;
    let blockedCount = 0;
    //For pagination
    const PAGE_SIZE = this.pageSize;
    let hasMore = true;
    let lastId = 0;
    let currentIndex = 0;

    let totalUsers = await this.subscriberRepo.countTotalSubcribers();
    
    await this.messenger.sendMessage(job.admin_id, `Broadcast started for ${totalUsers} users.`);
    
    this.logger.info(`[Broadcast] Broadcast started for ${totalUsers} users.`);
    this.logger.info( 
      `[Broadcast] Current Speed: ${this.rateManager.getSpeed()} msg/sec`
    );

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

        this.logger.debug(`Batch size: ${batchSize}`);

        try {
          await this.rateManager.getLimiter().schedule(
            { id: `msg-${currentIndex}` },
            async () => {
              await this.messenger.copyMessage(
                subscriber.telegramId,
                job.chat_id,
                job.message_id
              );
              this.logger.debug(
                `[${currentIndex} / ${totalUsers}] Sent: ${subscriber.telegramId}`
              );
              sentCount++;
            }
          );

          if (
            currentIndex % this.chunkSize === 0 &&
            currentIndex < totalUsers
          ) {
            this.logger.info(`Chunking pause at ${currentIndex}`);
            await new Promise((res) => setTimeout(res, 2000));

            if (currentIndex % 500 === 0) {
              this.reportProgress(
                job.admin_id,
                sentCount,
                failedCount,
                blockedCount
              ).catch((error) => {
                this.logger.error("Failed to report progress to admin", error);
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
      this.logger.info(
        `Batch message sending completed for ${currentIndex} subscribers`
      );
    }

    const endTime = performance.now();
    const durationInMinutes = Math.floor((endTime - startTime) / 60000);
    const durationInSeconds = Math.floor(
      ((endTime - startTime) % 60000) / 1000
    );
    const durationMessage = `${durationInMinutes}m ${durationInSeconds}s`;

    await this.messenger.sendMessage(
      job.admin_id,
      `✅ Broadcast Finished${CONFIG.DRY_RUN ? " (DRY RUN)" : ""}\nSent: ${sentCount}\nBlocked/Pruned: ${blockedCount}\nErrors: ${failedCount}\nDuration: ${durationMessage}`
    );

    this.logger.info(
      `[Broadcast] Broadcast finished for ${totalUsers} users. Duration: ${durationMessage}`
    );
  }

  public setSpeed(speed: number) {
      return this.rateManager.setSpeed(speed);
  }

  public getSpeed() {
      return this.rateManager.getSpeed();
  }
}
