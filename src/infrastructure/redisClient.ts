import Redis, { RedisOptions } from "ioredis";
import { CONFIG } from "../config/config";
import { GetLogger } from "./logger";

class RedisClient {
  private static instance: RedisClient;
  private client: Redis;
  private logger = GetLogger("RedisClient");

  private constructor() {
    const options: RedisOptions = {
      host: CONFIG.REDIS.HOST,
      port: CONFIG.REDIS.PORT,
      password: CONFIG.REDIS.PASSWORD,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: CONFIG.REDIS.MAX_RETRIES,
      connectionName: CONFIG.REDIS.CONNECTION_NAME,
    };

    this.client = new Redis(options);

    this.initializeEventHandlers();
  }

  // Singleton pattern to ensure only one connection exists
  public static getInstance(): RedisClient {
    if (!RedisClient.instance) {
      RedisClient.instance = new RedisClient();
    }
    return RedisClient.instance;
  }

  private initializeEventHandlers() {
    this.client.on("connect", () => {
      this.logger.info("--- [Redis] Status: Connecting... ---");
    });

    this.client.on("ready", () => {
      this.logger.info("--- [Redis] Status: Ready and Connected! ---");
    });

    this.client.on("error", (err) => {
      this.logger.error(`--- [Redis] Error: ${err.message} ---`);
    });

    this.client.on("reconnecting", () => {
      this.logger.warn("--- [Redis] Status: Attempting to reconnect... ---");
    });

    this.client.on("end", () => {
      this.logger.info("--- [Redis] Status: Connection closed. ---");
    });
  }

  public async quit(): Promise<void> {
    this.logger.info("[Redis] Closing connection...");
    await this.client.quit();
  }

  public getClient(): Redis {
    return this.client;
  }
}

export const redisClient = RedisClient.getInstance();
