import { GetLogger } from "../../infrastructure/logger";
import { IBroadcastRepository, BroadcastJob } from "./IBroadcastRepository";

export class BroadcastRepository implements IBroadcastRepository {
  private logger = GetLogger("BroadcastRepository");

  constructor(private db: any) {}

  async getOngoingBroadcasts(): Promise<BroadcastJob[]> {
    try {
      const [rows] = await this.db.query(
        "SELECT * FROM broadcasts WHERE status IN ('pending', 'processing') ORDER BY created_at ASC"
      );
      return rows;
    } catch (error) {
      this.logger.error("Error fetching ongoing broadcasts:", error);
      throw new Error("Could not retrieve ongoing broadcasts from database.");
    }
  }

  async createBroadcast(
    adminId: number,
    messageId: number,
    chatId: number
  ): Promise<void> {
    try {
      await this.db.query(
        "INSERT INTO broadcasts (admin_id, message_id, chat_id, status) VALUES (?, ?, ?, 'pending')",
        [adminId, messageId, chatId]
      );
    } catch (error) {
      this.logger.error("Error creating broadcast record:", error);
      throw new Error("Failed to create a new broadcast entry.");
    }
  }

  async getNextPendingBroadcast(): Promise<BroadcastJob | null> {
    try {
      const [rows] = await this.db.query(
        "SELECT * FROM broadcasts WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1"
      );
      return rows && rows.length > 0 ? rows[0] : null;
    } catch (error) {
      this.logger.error("Error fetching next pending broadcast:", error);
      throw new Error("Failed to retrieve the next pending broadcast.");
    }
  }

  async updateStatus(
    id: number,
    status: BroadcastJob["status"]
  ): Promise<void> {
    try {
      await this.db.query("UPDATE broadcasts SET status = ? WHERE id = ?", [
        status,
        id,
      ]);
    } catch (error) {
      this.logger.error(`Error updating broadcast status for ID ${id}:`, error);
      throw new Error(`Failed to update broadcast status to ${status}.`);
    }
  }
}
