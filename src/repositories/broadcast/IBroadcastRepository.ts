import { BroadcastJob } from "./BroadcastJob";

export interface IBroadcastRepository {
  getOngoingBroadcasts(): Promise<BroadcastJob[]>;
  createBroadcast(
    adminId: number,
    messageId: number,
    chatId: number
  ): Promise<boolean>; // false: this message already has a broadcast
  claimNext(): Promise<BroadcastJob | null>;
  requeueInterrupted(): Promise<void>;
  saveProgress(id: number, progress: BroadcastProgress): Promise<void>;
  cancel(id: number): Promise<boolean>;
  finish(id: number, status: BroadcastJob["status"]): Promise<void>;
}
export { BroadcastJob };
export type BroadcastProgress = Pick<
  BroadcastJob,
  "last_subscriber_id" | "sent_count" | "failed_count" | "blocked_count"
> &
  Partial<Pick<BroadcastJob, "attempts">>;
