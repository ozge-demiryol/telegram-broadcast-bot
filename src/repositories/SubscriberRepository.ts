import { Pool, RowDataPacket } from "mysql2/promise";
import { ISubscriberRepository } from "@/repositories/ISubscriberRepository";
import { Subscriber } from "./Subscriber";
import { Logger } from "../infrastructure/logger";
import { Readable } from "stream";

export class SubscriberRepository implements ISubscriberRepository {
  constructor(private db: Pool) {}

  async subscribe(
    telegramId: number,
    username: string,
    isAdmin: boolean
  ): Promise<void> {
    if (!this.db) {
      throw new Error("Database connection not available");
    }

    if (!telegramId || telegramId <= 0) {
      throw new Error("Invalid telegramId provided");
    }

    if (!username || username.trim().length === 0) {
      throw new Error("Username cannot be empty");
    }

    const sql = `
    INSERT INTO subscribers (telegramId, username, isAdmin, isActive, createdAt)
    VALUES (?, ?, ?, true, UTC_TIMESTAMP())
    ON DUPLICATE KEY UPDATE username = VALUES(username), isActive = true, modifiedAt = UTC_TIMESTAMP()
  `;

    try {
      await this.db.query(sql, [telegramId, username.trim(), isAdmin]);
      Logger.info(`User ${telegramId} successfully subscribed.`);
    } catch (error) {
      Logger.error(
        `Database Error in subscribe() for user ${telegramId}`,
        error
      );
      throw new Error("FAILED_TO_SUBSCRIBE");
    }
  }

  async findByTelegramId(telegramId: number): Promise<Subscriber | null> {
    try {
      const [rows] = await this.db.query(
        "SELECT * FROM subscribers WHERE telegramId = ? LIMIT 1",
        [telegramId]
      );

      if (!Array.isArray(rows) || rows.length === 0) {
        return null;
      }

      return (rows as Subscriber[])[0];
    } catch (error) {
      Logger.error(`Error in findByTelegramId() for id ${telegramId}`, error);
      throw error;
    }
  }

  async getSubscribers(): Promise<Subscriber[]> {
    try {
      const [rows] = await this.db.query(
        "SELECT * FROM subscribers WHERE isActive = true"
      );
      return rows as Subscriber[];
    } catch (error) {
      Logger.error("Error in findAllActive()", error);
      throw error;
    }
  }

  getSubscribersStream(lastId: number, limit: number): Readable {
    return this.db.pool
      .query(
        "SELECT * FROM subscribers WHERE isActive = true AND id > ? ORDER BY id ASC LIMIT ?",
        [lastId, limit]
      )
      .stream();
  }

  async setActiveStatus(telegramId: number, isActive: boolean): Promise<void> {
    try {
      await this.db.query(
        "UPDATE subscribers SET isActive = ?, modifiedAt = UTC_TIMESTAMP() WHERE telegramId = ?",
        [isActive, telegramId]
      );
    } catch (error) {
      Logger.error(`Error in setActiveStatus() for id ${telegramId}`, error);
      throw error;
    }
  }

  async setAdminStatus(telegramId: number, isAdmin: boolean): Promise<void> {
    try {
      await this.db.query(
        "UPDATE subscribers SET isAdmin = ?, modifiedAt = UTC_TIMESTAMP() WHERE telegramId = ?",
        [isAdmin, telegramId]
      );
    } catch (error) {
      Logger.error(`Error in setAdminStatus() for id ${telegramId}`, error);
      throw error;
    }
  }

  async isAdmin(telegramId: number): Promise<boolean> {
    try {
      const user = await this.findByTelegramId(telegramId);
      return user?.isAdmin ?? false;
    } catch (error) {
      Logger.error(`Error in isAdmin() for id ${telegramId}`, error);
      throw error;
    }
  }

  async findByUsername(username: string): Promise<Subscriber | null> {
    try {
      const [rows] = await this.db.query(
        "SELECT * FROM subscribers WHERE username = ? LIMIT 1",
        [username]
      );

      if (!Array.isArray(rows) || rows.length === 0) {
        return null;
      }

      return (rows as Subscriber[])[0];
    } catch (error) {
      Logger.error(`Error in findByUsername() for username ${username}`, error);
      throw error;
    }
  }

  async unsubscribe(telegramId: number): Promise<void> {
    try {
      await this.db.query(
        "UPDATE subscribers SET isActive = false, modifiedAt = UTC_TIMESTAMP() WHERE telegramId = ?",
        [telegramId]
      );
    } catch (error) {
      Logger.error(`Error in unsubscribe() for id ${telegramId}`, error);
      throw error;
    }
  }

  async countTotalSubcribers(): Promise<number> {
    try {
      const [rows] = await this.db.query<RowDataPacket[]>(
        "SELECT COUNT(*) as count FROM subscribers WHERE isActive = true"
      );

      const total = rows.length > 0 ? rows[0].count : 0;
      return Number(total);
    } catch (error) {
      Logger.error("Error in countTotalSubscribers()", error);
      throw error;
    }
  }
}
