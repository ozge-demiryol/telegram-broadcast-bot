import { redisClient } from "./redisClient";
import { Logger } from "./logger";

class RedisRepository {
  public async set(
    key: string,
    value: string,
    ttlSeconds?: number
  ): Promise<void> {
    try {
      const client = redisClient.getClient();
      if (ttlSeconds) {
        await client.set(key, value, "EX", ttlSeconds);
      } else {
        await client.set(key, value);
      }
      Logger.info(`[Redis] Success: Set key "${key}"`);
    } catch (error) {
      Logger.error(`[Redis] Failed to set key "${key}":`, error);
      throw error;
    }
  }

  public async get(key: string): Promise<string | null> {
    try {
      const client = redisClient.getClient();
      const data = await client.get(key);
      Logger.info(`[Redis] Success: Get key "${key}"`);
      return data;
    } catch (error) {
      Logger.error(`[Redis] Failed to get key "${key}":`, error);
      throw error;
    }
  }

  public async addToSet(key: string, value: string): Promise<number> {
    try {
      const client = redisClient.getClient();
      const result = await client.sadd(key, value);

      if (result === 1) {
        Logger.info(`[Redis] Set: Added "${value}" to key "${key}"`);
      } else {
        Logger.info(
          `[Redis] Set: Member "${value}" already exists in "${key}"`
        );
      }

      return result;
    } catch (error) {
      Logger.error(`[Redis] Failed to add to set "${key}":`, error);
      throw error;
    }
  }

  public async getSetMembers(key: string): Promise<string[]> {
    try {
      const client = redisClient.getClient();
      const members = await client.smembers(key);
      Logger.info(
        `[Redis] Set: Retrieved ${members.length} members from "${key}"`
      );
      return members;
    } catch (error) {
      Logger.error(`[Redis] Failed to get set members for "${key}":`, error);
      throw error;
    }
  }
}

export const redisRepository = new RedisRepository();
