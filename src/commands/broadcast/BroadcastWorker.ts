import StatusCodes from "http-status-codes";
import { Markup } from "telegraf";
import { IMessenger } from "../../infrastructure/telegram/IMessenger";
import { ISubscriberRepository } from "../../repositories/ISubscriberRepository";
import { GetLogger } from "../../infrastructure/logger";
import { CONFIG } from "../../config/config";
import { BroadcastJob, IBroadcastRepository } from "../../repositories/broadcast/IBroadcastRepository";
import { ISettingsRepository } from "../../repositories/settings/ISettingsRepository";
import { Subscriber } from "../../repositories/Subscriber";
import { RateLimiterManager } from "../../infrastructure/rate-limiter/RateLimiterManager";

export class BroadcastWorker {
  private rateManager: RateLimiterManager;
  private running = false;
  private wakeAgain = false;
  private currentJobId: number | null = null;
  private maxAttempts = 3;
  private maxErrorStreak = 20;
  private retryDelayMs = 60_000;
  private retryTimer?: NodeJS.Timeout;
  private shouldStop = false;
  private chunkSize = CONFIG.TELEGRAM.CHUNK_SIZE;
  private pageSize = CONFIG.TELEGRAM.PAGE_SIZE;
  private logger = GetLogger("BroadcastWorker");

  constructor(
    private messenger: IMessenger,
    private subscriberRepo: ISubscriberRepository,
    private broadcastRepo: IBroadcastRepository,
    private settingsRepo: ISettingsRepository
  ) {
    this.rateManager = new RateLimiterManager(this.settingsRepo);
    this.initSpeed().catch((error) =>
      this.logger.error("Failed to initialize broadcast speed", error)
    );
  }

  private async initSpeed() {
    const storedSpeed = await this.settingsRepo.getBroadcastLimit();
    await this.rateManager.setSpeed(storedSpeed);
    this.logger.info(`Initialized with speed: ${await this.rateManager.getSpeed()} msg/sec`);
  }

  public get runningJobId() {
    return this.currentJobId;
  }

  public stopBroadcast(jobId: number) {
    if (jobId === this.currentJobId) this.shouldStop = true;
  }

  public isAnyBroadcastRunning() {
    return this.currentJobId !== null;
  }

  // Safe to call any number of times: only one loop ever runs.
  public wake() {
    this.wakeAgain = true;
    if (this.running) return;
    this.running = true; // set synchronously, before any await
    this.run()
      .catch((error) => {
        // The job stays 'processing' and is requeued by the next run
        this.logger.error("Broadcast queue stopped, retrying later", error);
        clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => this.wake(), this.retryDelayMs);
      })
      .finally(() => (this.running = false));
  }

  private async run() {
    // Only one loop runs in one process, so a job still marked 'processing' here
    // was interrupted (restart, crash): put it back in the queue.
    await this.broadcastRepo.requeueInterrupted();

    // wakeAgain covers a job that arrives while we are finding the queue empty
    do {
      this.wakeAgain = false;
      let job;
      while ((job = await this.broadcastRepo.claimNext())) {
        await this.process(job);
      }
    } while (this.wakeAgain);
  }

  private async process(job: BroadcastJob) {
    this.currentJobId = job.id;
    this.shouldStop = false;
    try {
      // attempts goes back to 0 on progress, so this only catches a job that
      // keeps dying at the same place (including one that crashes the process)
      if (job.attempts > this.maxAttempts) {
        await this.broadcastRepo.finish(job.id, "failed");
        await this.notify(
          job.admin_id,
          `❌ Broadcast #${job.id} failed: no progress after ${this.maxAttempts} attempts (${job.sent_count} sent).`
        );
        return;
      }
      await this.runBroadcast(job, performance.now());
      // no-op if the job was cancelled in the meantime
      await this.broadcastRepo.finish(job.id, "completed");
    } finally {
      this.currentJobId = null;
    }
  }

  // A failed notification to the admin must not fail the broadcast itself.
  private async notify(adminId: number, text: string, extra?: any) {
    try {
      await this.messenger.sendMessage(adminId, text, extra);
    } catch (error) {
      this.logger.error("Failed to message the admin", error);
    }
  }

  private stopButton(jobId: number) {
    return Markup.inlineKeyboard([
      Markup.button.callback("🛑 Stop Broadcast", `stop_broadcast_${jobId}`),
    ]);
  }

  private async reportProgress(
    jobId: number,
    adminId: number,
    sent: number,
    failed: number,
    blocked: number
  ) {
    const totalProcessed = sent + failed + blocked;
    await this.notify(
      adminId,
      `📊 Progress: ${totalProcessed} users reached`,
      this.stopButton(jobId)
    );
  }

  private async runBroadcast(job: BroadcastJob, startTime: number) {
    // Start from what was saved, so an interrupted job continues where it stopped
    let sentCount = job.sent_count;
    let failedCount = job.failed_count;
    let blockedCount = job.blocked_count;
    //For pagination
    const PAGE_SIZE = this.pageSize;
    let hasMore = true;
    let lastId = job.last_subscriber_id;
    let currentIndex = sentCount + failedCount + blockedCount;

    let totalUsers = await this.subscriberRepo.countTotalSubcribers();

    // Circuit breaker: many errors in a row mean the problem is not the subscribers
    let errorStreak = 0;
    let beforeStreak = { last_subscriber_id: lastId, failed_count: failedCount };

    await this.notify(
      job.admin_id,
      job.last_subscriber_id > 0
        ? `▶️ Broadcast #${job.id} resumed after a restart (${sentCount} sent so far).`
        : `Broadcast started for ${totalUsers} users.`,
      this.stopButton(job.id)
    );

    this.logger.info(`[Broadcast] Broadcast started for ${totalUsers} users.`);
    this.logger.info(
      `[Broadcast] Current Speed: ${await this.rateManager.getSpeed()} msg/sec`
    );

    while (hasMore) {
      let batchSize = 0;

      const stream = this.subscriberRepo.getSubscribersStream(
        lastId,
        PAGE_SIZE
      );

      for await (const row of stream) {
        if (this.shouldStop) {
          this.logger.info("Broadcast stopped manually by admin.");
          await this.notify(
            job.admin_id,
            "🛑 Broadcast has been stopped by admin."
          );
          hasMore = false;
          break;
        }

        const subscriber = row as Subscriber;
        batchSize++;
        currentIndex++;
        const previousId = lastId;
        lastId = subscriber.id;

        this.logger.debug(`Batch size: ${batchSize}`);

        let reached = true; // delivered or blocked, as opposed to an error
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
            reached = false;
            // "chat not found" is about this subscriber only
            if (!error.response?.description?.includes("chat not found") && errorStreak++ === 0) {
              beforeStreak = { last_subscriber_id: previousId, failed_count: failedCount };
            }
            failedCount++;
            this.logger.error(`[Error] msg-${currentIndex}: ${error.message}`);
          }
        }

        // Saved after every subscriber: a crash repeats at most one message.
        // Telegram allows 30 msg/sec at most, so these writes are cheap.
        await this.broadcastRepo.saveProgress(job.id, {
          last_subscriber_id: lastId,
          sent_count: sentCount,
          failed_count: failedCount,
          blocked_count: blockedCount,
          ...(reached && { attempts: 0 }),
        });

        if (reached) errorStreak = 0;
        if (errorStreak >= this.maxErrorStreak) {
          // Rewind so that nobody in the streak is skipped when the job is retried
          await this.broadcastRepo.saveProgress(job.id, {
            ...beforeStreak,
            sent_count: sentCount,
            blocked_count: blockedCount,
          });
          throw new Error(`${errorStreak} errors in a row`);
        }

        if (currentIndex % this.chunkSize === 0 && currentIndex < totalUsers) {
          this.logger.info(`Chunking pause at ${currentIndex}`);
          await new Promise((res) => setTimeout(res, 2000));

          if (currentIndex % 500 === 0) {
            this.reportProgress(job.id, job.admin_id, sentCount, failedCount, blockedCount);
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

    await this.notify(
      job.admin_id,
      `✅ Broadcast Finished${CONFIG.DRY_RUN ? " (DRY RUN)" : ""}\nSent: ${sentCount}\nBlocked/Pruned: ${blockedCount}\nErrors: ${failedCount}\nDuration: ${durationMessage}`
    );

    this.logger.info(
      `[Broadcast] Broadcast finished for ${totalUsers} users. Duration: ${durationMessage}`
    );
  }

  public async setSpeed(speed: number) {
    if (this.isAnyBroadcastRunning()) {
      return {
        success: false,
        message: "⚠️ Cannot change speed while a broadcast is in progress. Try again after the broadcast is completed.",
      };
    }
    return await this.rateManager.setSpeed(speed);
  }

  public async getSpeed() {
    return await this.rateManager.getSpeed();
  }
}
