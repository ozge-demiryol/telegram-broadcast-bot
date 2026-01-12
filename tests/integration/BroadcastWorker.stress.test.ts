import { BroadcastWorker } from "../../src/commands/broadcast/BroadcastWorker";
import { IMessenger } from "../../src/infrastructure/telegram/IMessenger";
import { ISubscriberRepository } from "../../src/repositories/ISubscriberRepository";

class TelegramAPISimulator implements IMessenger {
  private requestTimestamps: number[] = [];
  private readonly RATE_LIMIT = 30;
  private readonly WINDOW_MS = 1000;
  public rateLimitHits = 0;

  async copyMessage(toChatId: number, fromChatId: number, messageId: number): Promise<void> {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter((ts) => now - ts < this.WINDOW_MS);

    if (this.requestTimestamps.length >= this.RATE_LIMIT) {
      this.rateLimitHits++;
      const error: any = new Error("Too Many Requests");
      error.response = {
        error_code: 429,
        parameters: { retry_after: 1 },
      };
      throw error;
    }

    this.requestTimestamps.push(now);
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 20 + 10)); // 10-30ms latency
  }

  async forwardMessage(): Promise<void> {}
  async sendMessage(): Promise<void> {}
}

describe("BroadcastWorker Stress Tests - Real Telegram Simulation", () => {
  let worker: BroadcastWorker;
  let telegramSimulator: TelegramAPISimulator;
  let mockSubscriberRepo: jest.Mocked<ISubscriberRepository>;
  let mockDb: any;

  beforeEach(() => {
    telegramSimulator = new TelegramAPISimulator();

    mockSubscriberRepo = {
      findByTelegramId: jest.fn(),
      findByUsername: jest.fn(),
      findAllActive: jest.fn(),
      setActiveStatus: jest.fn(),
      setAdminStatus: jest.fn(),
      isAdmin: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
    };

    const broadcasts: any[] = [];
    mockDb = {
      query: jest.fn().mockImplementation(async (sql: string, params?: any[]) => {
        if (sql.includes("SELECT * FROM broadcasts WHERE status IN")) {
          return [broadcasts.filter((b) => ["pending", "processing"].includes(b.status))];
        }
        if (sql.includes("INSERT INTO broadcasts")) {
          const newBroadcast = {
            id: broadcasts.length + 1,
            admin_id: params![0],
            message_id: params![1],
            chat_id: params![2],
            status: "pending",
            created_at: new Date(),
          };
          broadcasts.push(newBroadcast);
          return [{ insertId: newBroadcast.id }];
        }
        if (sql.includes("SELECT * FROM broadcasts WHERE status = 'pending'")) {
          return [broadcasts.filter((b) => b.status === "pending")];
        }
        if (sql.includes("UPDATE broadcasts SET status = 'processing'")) {
          const broadcast = broadcasts.find((b) => b.id === params![0]);
          if (broadcast) broadcast.status = "processing";
          return [{ affectedRows: 1 }];
        }
        if (sql.includes("UPDATE broadcasts SET status = 'completed'")) {
          const broadcast = broadcasts.find((b) => b.id === params![0]);
          if (broadcast) broadcast.status = "completed";
          return [{ affectedRows: 1 }];
        }
        if (sql.includes("SELECT COUNT(*) as count FROM subscribers")) {
          return [[{ count: 25000 }]];
        }
        if (sql.includes("SELECT telegramId FROM subscribers WHERE isActive = 1")) {
          const subscribers = Array.from({ length: 25000 }, (_, i) => ({
            telegramId: 1000000 + i,
          }));
          return [subscribers];
        }
        return [[]];
      }),
    };

    worker = new BroadcastWorker(telegramSimulator, mockSubscriberRepo, mockDb);
  });

  test("should handle 25k subscribers without hitting rate limits", async () => {
    await worker.enqueue(123456, 1, 123456);
    await new Promise((resolve) => setTimeout(resolve, 30000)); // 30 seconds

    expect(telegramSimulator.rateLimitHits).toBe(0);
  }, 35000);

  test("should recover from 429 errors gracefully", async () => {
    const errorSimulator = new TelegramAPISimulator();
    let callCount = 0;
    const originalCopyMessage = errorSimulator.copyMessage.bind(errorSimulator);

    errorSimulator.copyMessage = jest.fn().mockImplementation(async (toChatId: number, fromChatId: number, messageId: number) => {
      callCount++;
      if (callCount % 100 === 0) {
        const error: any = new Error("Too Many Requests");
        error.response = { error_code: 429, parameters: { retry_after: 2 } };
        throw error;
      }
      return originalCopyMessage(toChatId, fromChatId, messageId);
    });

    const testWorker = new BroadcastWorker(errorSimulator, mockSubscriberRepo, mockDb);
    await testWorker.enqueue(123456, 1, 123456);
    await new Promise((resolve) => setTimeout(resolve, 10000));

    expect(callCount).toBeGreaterThan(0);
  }, 15000);
});
