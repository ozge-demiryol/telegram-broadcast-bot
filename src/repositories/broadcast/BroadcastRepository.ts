import { IBroadcastRepository, BroadcastJob } from "./IBroadcastRepository";

export class BroadcastRepository implements IBroadcastRepository {
  constructor(private db: any) {}

  async getOngoingBroadcasts(): Promise<BroadcastJob[]> {
    const [rows] = await this.db.query(
      "SELECT * FROM broadcasts WHERE status IN ('pending', 'processing') ORDER BY created_at ASC"
    );
    return rows;
  }

  async createBroadcast(
    adminId: number,
    messageId: number,
    chatId: number
  ): Promise<void> {
    await this.db.query(
      "INSERT INTO broadcasts (admin_id, message_id, chat_id, status) VALUES (?, ?, ?, 'pending')",
      [adminId, messageId, chatId]
    );
  }

  async getNextPendingBroadcast(): Promise<BroadcastJob | null> {
    const [rows] = await this.db.query(
      "SELECT * FROM broadcasts WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1"
    );
    return rows && rows.length > 0 ? rows[0] : null;
  }

  async updateStatus(
    id: number,
    status: BroadcastJob["status"]
  ): Promise<void> {
    await this.db.query("UPDATE broadcasts SET status = ? WHERE id = ?", [
      status,
      id,
    ]);
  }
}
