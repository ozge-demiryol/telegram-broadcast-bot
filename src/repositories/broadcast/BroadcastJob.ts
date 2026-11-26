export interface BroadcastJob {
  id: number;
  admin_id: number;
  message_id: number;
  chat_id: number;
  status: "pending" | "processing" | "completed" | "cancelled" | "failed";
  created_at: Date;
  last_subscriber_id: number;
  sent_count: number;
  failed_count: number;
  blocked_count: number;
  attempts: number;
}
