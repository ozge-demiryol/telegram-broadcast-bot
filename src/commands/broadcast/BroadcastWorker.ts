import Bottleneck from "bottleneck";
import StatusCodes from "http-status-codes";
import { IMessenger } from "../../infrastructure/telegram/IMessenger";
import { ISubscriberRepository } from "../../repositories/ISubscriberRepository";
import { Logger } from "../../infrastructure/logger";
import { CONFIG } from "../../config/config";

export class BroadcastWorker {
  private limiter: Bottleneck;
  private isProcessing = false;

  constructor(
    private messenger: IMessenger,
    private subscriberRepo: ISubscriberRepository,
    private db: any // MySQL Pool
  ) {
    const rateLimit = CONFIG.TELEGRAM.RATE_LIMIT;
    const minTime = Math.ceil(1000 / rateLimit);

    this.limiter = new Bottleneck({
      minTime,
      maxConcurrent: CONFIG.TELEGRAM.CONCURRENT_REQUESTS,
    });

    // Dynamic wait on Telegram 429 (Too Many Requests) error
    this.limiter.on("failed", async (error, jobInfo) => {
      if (error.response?.error_code === StatusCodes.TOO_MANY_REQUESTS) {
        return (error.response.parameters?.retry_after || 5) * 1000;
      }
    });
  }

  async enqueue(adminId: number, messageId: number, chatId: number) {
    // Check if there's an ongoing broadcast
    const [ongoing] = await this.db.query(
      "SELECT * FROM broadcasts WHERE status IN ('pending', 'processing') ORDER BY created_at ASC"
    );

    await this.db.query(
      "INSERT INTO broadcasts (admin_id, message_id, chat_id, status) VALUES (?, ?, ?, 'pending')",
      [adminId, messageId, chatId]
    );

    // Notify admin if there's already a broadcast in progress
    if (ongoing && ongoing.length > 0) {
      const [subscribers] = await this.db.query(
        "SELECT COUNT(*) as count FROM subscribers WHERE isActive = 1"
      );
      const totalSubscribers = subscribers[0].count;
      const estimatedSeconds = Math.ceil(totalSubscribers / CONFIG.TELEGRAM.RATE_LIMIT);
      const estimatedMinutes = Math.floor(estimatedSeconds / 60);

      await this.messenger.sendMessage(
        adminId,
        `⏳ Your broadcast has been queued.\n\nThere is currently an ongoing broadcast. Estimated wait time: ~${estimatedMinutes} minutes.`
      );
    }

    setImmediate(() => this.processNext());
  }

  async processNext() {
    if (this.isProcessing) {
      Logger.debug("[BroadcastWorker] Already processing, skipping...");
      return;
    }

    try {
      const [rows] = await this.db.query(
        "SELECT * FROM broadcasts WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1"
      );

      if (!rows || rows.length === 0) {
        return;
      }

      const job = rows[0];
      Logger.info(`[BroadcastWorker] Starting broadcast job: ${job.id}`);
      this.isProcessing = true;

      await this.db.query(
        "UPDATE broadcasts SET status = 'processing' WHERE id = ?",
        [job.id]
      );
      await this.runBroadcast(job);
      await this.db.query(
        "UPDATE broadcasts SET status = 'completed' WHERE id = ?",
        [job.id]
      );
      Logger.info(`[BroadcastWorker] Broadcast job completed: ${job.id}`);
    } catch (err) {
      Logger.error("[CRITICAL] Broadcast job failed", err);
    } finally {
      this.isProcessing = false;
      setTimeout(() => this.processNext(), 1000);
    }
  }

  private async runBroadcast(job: any) {
    Logger.debug(`[BroadcastWorker] runBroadcast started for job: ${job.id}`);
    let sentCount = 0;
    let failedCount = 0;
    const promises: Promise<void>[] = [];

    // Fetch active subscribers
    const [subscribers] = await this.db.query(
      "SELECT telegramId FROM subscribers WHERE isActive = 1"
    );
    Logger.info(`[BroadcastWorker] Found subscribers: ${subscribers.length}`);

    for (const row of subscribers) {
      // Add task to limiter and store the promise
      const promise = this.limiter.schedule(async () => {
        try {
          Logger.debug(
            `[BroadcastWorker] Sending to: ${row.telegramId} from: ${job.chat_id} msgId: ${job.message_id}`
          );
          await this.messenger.copyMessage(
            row.telegramId,
            job.chat_id,
            job.message_id
          );
          sentCount++;
          Logger.debug(
            `[BroadcastWorker] Successfully sent to: ${row.telegramId}`
          );
        } catch (error: any) {
          Logger.error(
            `[BroadcastWorker] Failed to send to: ${row.telegramId}`,
            error
          );
          failedCount++;
          // Deactivate user if they blocked the bot (403 Forbidden)
          if (error.response?.error_code === StatusCodes.FORBIDDEN) {
            await this.subscriberRepo
              .setActiveStatus(row.telegramId, false)
              .catch(() => {});
          }
        }

        // Report status to admin every 250 messages (without freezing the UI)
        if ((sentCount + failedCount) % 250 === 0) {
          this.reportProgress(job.admin_id, sentCount, failedCount);
        }
      });
      promises.push(promise);
    }

    // Wait for all tasks to complete
    Logger.info(
      `[BroadcastWorker] All subscribers queued. Total promises: ${promises.length}`
    );
    await Promise.all(promises);
    Logger.info(
      `[BroadcastWorker] All messages sent. Sent: ${sentCount} Failed: ${failedCount}`
    );
    await this.messenger.sendMessage(
      job.admin_id,
      `✅ Broadcast Completed!\nSuccessful: ${sentCount}\nFailed: ${failedCount}`
    );
  }

  private reportProgress(adminId: number, sent: number, failed: number) {
    // Fire-and-forget: Don't let admin notification delay the broadcast
    this.messenger
      .sendMessage(adminId, `📊 Progress: ${sent + failed} users reached...`)
      .catch(() => {});
  }
}
