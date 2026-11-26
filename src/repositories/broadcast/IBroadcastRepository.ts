import { BroadcastJob } from "./BroadcastJob";

export interface IBroadcastRepository {
  getOngoingBroadcasts(): Promise<BroadcastJob[]>;
  createBroadcast(
    adminId: number,
    messageId: number,
    chatId: number
  ): Promise<void>;
  getNextPendingBroadcast(): Promise<BroadcastJob | null>;
  updateStatus(id: number, status: BroadcastJob["status"]): Promise<void>;
}
export { BroadcastJob };
