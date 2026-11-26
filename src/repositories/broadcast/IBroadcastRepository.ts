import { BroadcastJob } from "./BroadcastJob";

export interface IBroadcastRepository {
  getOngoingBroadcasts(): Promise<BroadcastJob[]>;
  createBroadcast(
    adminId: number,
    messageId: number,
    chatId: number
  ): Promise<void>;
  claimNext(): Promise<BroadcastJob | null>;
  finish(id: number, status: BroadcastJob["status"]): Promise<void>;
}
export { BroadcastJob };
