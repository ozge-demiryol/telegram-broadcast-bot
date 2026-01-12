export interface BroadcastJob {
  id: number;
  admin_id: number;
  message_id: number;
  chat_id: number;
  status: "pending" | "processing" | "completed" | "failed";
  created_at: Date;
}
