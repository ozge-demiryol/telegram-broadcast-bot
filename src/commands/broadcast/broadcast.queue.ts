import { Queue, Worker, Job } from "bullmq";
import { Telegraf } from "telegraf";
import { StatusCodes } from "http-status-codes";
import { Logger } from "../../infrastructure/logger";
import { redisClient } from "../../infrastructure/redisClient";
import { ISubscriberRepository } from "../../repositories/ISubscriberRepository";
import { redisRepository } from "../../repositories/redis/redisRepository";
import { CONFIG } from "../../config/config";

const QUEUE_NAME = "telegram-broadcast";

export class BroadcastQueue {
  public queue: Queue;
  public worker!: Worker;

  constructor() {
    this.queue = new Queue(QUEUE_NAME, {
      connection: redisClient.getClient().options,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: true,
      },
    });
  }

  async addBulkMessages(
    userIds: number[],
    fromChatId: number,
    messageId: number,
    broadcastId: string,
    adminId: number
  ) {
    const jobs = userIds.map((id) => ({
      name: "send-copy",
      data: { targetUserId: id, fromChatId, messageId, broadcastId, adminId },
      opts: { jobId: `msg-${broadcastId}-${id}` },
    }));

    // BullMQ chunks large arrays automatically to avoid blocking the event loop
    await this.queue.addBulk(jobs);
    Logger.info(`Enqueued ${userIds.length} jobs for broadcast ${broadcastId}`);
  }

  setupWorker(bot: Telegraf, subscriberRepository: ISubscriberRepository) {
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        const { targetUserId, fromChatId, messageId, broadcastId } = job.data;

        Logger.debug(`[Job Started] ID: ${job.id} | User: ${targetUserId}`);

        try {
          // copyMessage is media-agnostic (works for text, photo, video, etc.)
          await bot.telegram.copyMessage(targetUserId, fromChatId, messageId);
        } catch (error: any) {
          const statusCode = error.response?.error_code;

          if (statusCode === StatusCodes.FORBIDDEN) {
            await subscriberRepository.unsubscribe(targetUserId);
            await redisRepository.hincrby(
              `broadcast:${broadcastId}`,
              "failed",
              1
            );
            return;
          }

          if (statusCode === StatusCodes.TOO_MANY_REQUESTS) {
            const retryAfter = error.response.parameters?.retry_after || 30; //TODO: Can't we use config?
            // Throwing with specific prefix for the custom backoff strategy
            throw new Error(`RETRY_AFTER:${retryAfter}`);
          }

          await redisRepository.hincrby(
            `broadcast:${broadcastId}`,
            "failed",
            1
          );
          throw error;
        }
      },
      {
        connection: redisClient.getClient().options,
        concurrency: CONFIG.TELEGRAM.CONCURRENT_REQUESTS,
        limiter: { max: CONFIG.TELEGRAM.RATE_LIMIT, duration: 1000 },
      }
    );

    this.worker.on("completed", async (job) => {
      await this.handleProgressUpdate(bot, job.data);
    });

    this.worker.on("failed", (job, err) => {
      Logger.error(`Job ${job?.id} failed: ${err.message}`);
    });
  }

  private async handleProgressUpdate(bot: Telegraf, data: any) {
    const { broadcastId, adminId } = data;
    const currentSent = await redisRepository.hincrby(
      `broadcast:${broadcastId}`,
      "sent",
      1
    );
    const stats = await redisRepository.hgetall(`broadcast:${broadcastId}`);

    const total = parseInt(stats.total);
    const failed = parseInt(stats.failed || "0");

    // --- DYNAMIC FREQUENCY LOGIC ---
    let reportInterval = 500; // Default

    if (total <= 100) {
      reportInterval = 10; // Update every 10
    } else if (total <= 1000) {
      reportInterval = 100; // Update every 100
    } else if (total > 10000) {
      reportInterval = 1000; // Update every 1000 for 20k+ lists
    }
    // -------------------------------

    const isMilestone = currentSent % reportInterval === 0;
    const isFinished = currentSent + failed >= total;

    if (isMilestone || isFinished) {
      const elapsedSeconds =
        (Date.now() - new Date(stats.startTime).getTime()) / 1000;
      const speed = currentSent / elapsedSeconds;
      const etaSeconds =
        speed > 0 ? Math.round((total - currentSent) / speed) : 0;

      const progressMsg =
        `📊 *Broadcast Report*\n\n` +
        `✅ Sent: ${currentSent.toLocaleString()}\n` +
        `❌ Failed: ${stats.failed}\n` +
        `⚡ Speed: ${speed.toFixed(1)} msg/sec\n` +
        `⏳ ETA: ${Math.floor(etaSeconds / 60)}m ${etaSeconds % 60}s\n\n` +
        `${isFinished ? "🏁 *Finished!*" : "🕒 _Processing..._"}`;

      await bot.telegram.sendMessage(adminId, progressMsg, {
        parse_mode: "Markdown",
      });

      if (isFinished) {
        await redisRepository.expire(`broadcast:${broadcastId}`, 86400); // Cleanup after 24h
      }
    }
  }
}

export const broadcastQueue = new BroadcastQueue();
