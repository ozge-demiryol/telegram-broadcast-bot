import { redisClient } from "../../infrastructure/redisClient";
import { GetLogger } from "../../infrastructure/logger";

class RedisRepository {
  private logger = GetLogger("RedisRepository");

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
      this.logger.info(`[Redis] Success: Set key "${key}"`);
    } catch (error) {
      this.logger.error(`[Redis] Failed to set key "${key}":`, error);
      throw error;
    }
  }

  public async get(key: string): Promise<string | null> {
    try {
      const client = redisClient.getClient();
      const data = await client.get(key);
      this.logger.info(`[Redis] Success: Get key "${key}"`);
      return data;
    } catch (error) {
      this.logger.error(`[Redis] Failed to get key "${key}":`, error);
      throw error;
    }
  }

  public async addToSet(key: string, value: string): Promise<number> {
    try {
      const client = redisClient.getClient();
      const result = await client.sadd(key, value);

      if (result === 1) {
        this.logger.info(`[Redis] Set: Added "${value}" to key "${key}"`);
      } else {
        this.logger.info(
          `[Redis] Set: Member "${value}" already exists in "${key}"`
        );
      }

      return result;
    } catch (error) {
      this.logger.error(`[Redis] Failed to add to set "${key}":`, error);
      throw error;
    }
  }

  public async getSetMembers(key: string): Promise<string[]> {
    try {
      const client = redisClient.getClient();
      const members = await client.smembers(key);
      this.logger.info(
        `[Redis] Set: Retrieved ${members.length} members from "${key}"`
      );
      return members;
    } catch (error) {
      this.logger.error(
        `[Redis] Failed to get set members for "${key}":`,
        error
      );
      throw error;
    }
  }

  public async hset(
    key: string,
    data: Record<string, string | number>
  ): Promise<void> {
    try {
      const client = redisClient.getClient();
      await client.hset(key, data);
      this.logger.info(`[Redis] Hash: Set fields in "${key}"`);
    } catch (error) {
      this.logger.error(`[Redis] Failed to hset "${key}":`, error);
      throw error;
    }
  }

  public async hincrby(
    key: string,
    field: string,
    increment: number
  ): Promise<number> {
    try {
      const client = redisClient.getClient();
      const result = await client.hincrby(key, field, increment);
      this.logger.debug(
        `[Redis] Hash: Incremented "${field}" in "${key}" by ${increment}`
      );
      return result;
    } catch (error) {
      this.logger.error(`[Redis] Failed to hincrby "${key}":`, error);
      throw error;
    }
  }

  public async hgetall(key: string): Promise<Record<string, string>> {
    try {
      const client = redisClient.getClient();
      const data = await client.hgetall(key);
      this.logger.debug(`[Redis] Hash: Retrieved all fields from "${key}"`);
      return data;
    } catch (error) {
      this.logger.error(`[Redis] Failed to hgetall "${key}":`, error);
      throw error;
    }
  }

  public async expire(key: string, seconds: number): Promise<void> {
    try {
      const client = redisClient.getClient();
      await client.expire(key, seconds);
      this.logger.debug(`[Redis] Set expiry for "${key}" to ${seconds}s`);
    } catch (error) {
      this.logger.error(`[Redis] Failed to set expire "${key}":`, error);
      throw error;
    }
  }
}

export const redisRepository = new RedisRepository();
