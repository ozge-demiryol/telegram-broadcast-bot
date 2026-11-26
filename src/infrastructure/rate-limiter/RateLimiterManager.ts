import Bottleneck from "bottleneck";
import { GetLogger } from "../../infrastructure/logger";
import { StatusCodes } from "http-status-codes";
import { ISettingsRepository } from "../../repositories/settings/ISettingsRepository";
import { BROADCAST_SPEED } from "../../config/constants";

export class RateLimiterManager {
  private limiter: Bottleneck;
  private logger = GetLogger("RateLimiterManager");

  private readonly MAX_MSG_PER_SECOND = BROADCAST_SPEED.MAX;
  private readonly MIN_MSG_PER_SECOND = BROADCAST_SPEED.MIN;
  private currentMinTime: number;

  constructor(private settingsRepo: ISettingsRepository) {
    this.currentMinTime = Math.floor(1000 / BROADCAST_SPEED.DEFAULT);
    this.limiter = new Bottleneck({
      minTime: this.currentMinTime,
      maxConcurrent: 1,
    });

    this.setupErrorHandlers();
  }

  // Exposes the Bottleneck instance (so Worker can use it)
  public getLimiter(): Bottleneck {
    return this.limiter;
  }

  /**
   * Returns current speed in "Messages Per Second".
   */
  public async getSpeed(): Promise<number> {
    const limit = await this.settingsRepo.getBroadcastLimit();
    return limit;
  }

  public async setSpeed(messagesPerSecond: number): Promise<{ success: boolean; message: string }> {
    if (messagesPerSecond > this.MAX_MSG_PER_SECOND) {
      return {
        success: false,
        message: `❌ Error: Telegram limit exceeded! Max speed can be ${this.MAX_MSG_PER_SECOND} msg/sec.`,
      };
    }

    if (messagesPerSecond < this.MIN_MSG_PER_SECOND) {
      return {
        success: false,
        message: `❌ Error: Speed too low. Minimum can be ${this.MIN_MSG_PER_SECOND} msg/sec.`,
      };
    }

    const newMinTime = Math.floor(1000 / messagesPerSecond);
    this.currentMinTime = newMinTime;

    this.limiter.updateSettings({
      minTime: newMinTime,
    });

    await this.settingsRepo.setBroadcastLimit(messagesPerSecond);

    this.logger.info(
      `[Rate Update] Speed updated: ${messagesPerSecond} msg/sec (Delay: ${newMinTime}ms)`
    );

    return {
      success: true,
      message: `🚀 Speed successfully set to **${messagesPerSecond} msg/sec**`,
    };
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
      if (
        error.name === "TimeoutError" ||
        error.code === "ETIMEDOUT" ||
        error.code === "ECONNREFUSED"
      ) {
        this.logger.error(
          `[Network] Timeout at ${id}. Waiting 7s before retry.`
        );
        return 7000;
      }

      this.logger.error(
        `Error at ${id}. Waiting 7s before retry.`
      );

      return null;
    });
  }
}