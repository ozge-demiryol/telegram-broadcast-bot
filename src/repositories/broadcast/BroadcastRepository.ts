import { GetLogger } from "../../infrastructure/logger";
import { IBroadcastRepository, BroadcastJob, BroadcastProgress } from "./IBroadcastRepository";

export class BroadcastRepository implements IBroadcastRepository {
  private logger = GetLogger("BroadcastRepository");

  constructor(private db: any) { }

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
  ): Promise<boolean> {
    try {
      await this.db.query(
        "INSERT INTO broadcasts (admin_id, message_id, chat_id, status) VALUES (?, ?, ?, 'pending')",
        [adminId, messageId, chatId]
      );
      return true;
    } catch (error: any) {
      // unique (chat_id, message_id): a double click on Confirm
      if (error.code === "ER_DUP_ENTRY") return false;
      this.logger.error("Error creating broadcast record:", error);
      throw new Error("Failed to create a new broadcast entry.");
    }
  }

  // Takes the oldest pending job. The status condition in the UPDATE makes sure
  // only one caller can win it.
  async claimNext(): Promise<BroadcastJob | null> {
    while (true) {
      const [pending] = await this.db.query(
        "SELECT id FROM broadcasts WHERE status = 'pending' ORDER BY created_at, id LIMIT 1"
      );
      if (!pending.length) return null;

      const { id } = pending[0];
      const [result] = await this.db.query(
        "UPDATE broadcasts SET status = 'processing', attempts = attempts + 1 WHERE id = ? AND status = 'pending'",
        [id]
      );
      if (result.affectedRows !== 1) continue;

      const [rows] = await this.db.query("SELECT * FROM broadcasts WHERE id = ?", [id]);
      return rows[0];
    }
  }

  async requeueInterrupted(): Promise<void> {
    await this.db.query("UPDATE broadcasts SET status = 'pending' WHERE status = 'processing'");
  }

  async saveProgress(id: number, progress: BroadcastProgress): Promise<void> {
    await this.db.query("UPDATE broadcasts SET ? WHERE id = ?", [progress, id]);
  }

  async cancel(id: number): Promise<boolean> {
    const [result] = await this.db.query(
      "UPDATE broadcasts SET status = 'cancelled' WHERE id = ? AND status IN ('pending', 'processing')",
      [id]
    );
    return result.affectedRows === 1;
  }

  async finish(id: number, status: BroadcastJob["status"]): Promise<void> {
    await this.db.query(
      "UPDATE broadcasts SET status = ? WHERE id = ? AND status = 'processing'",
      [status, id]
    );
  }
}
