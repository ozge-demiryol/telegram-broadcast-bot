import { BroadcastWorker } from "../../src/commands/broadcast/BroadcastWorker";
import { IMessenger } from "../../src/infrastructure/telegram/IMessenger";
import { ISubscriberRepository } from "../../src/repositories/ISubscriberRepository";
import { RateLimitAnalyzer } from "../utils/RateLimitAnalyzer";

describe("Rate Limit Validation with Detailed Reports", () => {
  test("20k subscribers - full analysis", async () => {
    const timestamps: number[] = [];
    
    const mockMessenger: jest.Mocked<IMessenger> = {
      copyMessage: jest.fn().mockImplementation(async () => {
        timestamps.push(Date.now());
        await new Promise((resolve) => setTimeout(resolve, 5));
      }),
      forwardMessage: jest.fn(),
      sendMessage: jest.fn(),
    };

    const mockSubscriberRepo: jest.Mocked<ISubscriberRepository> = {
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
    const mockDb = {
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
          return [[{ count: 20000 }]];
        }
        if (sql.includes("SELECT telegramId FROM subscribers WHERE isActive = 1")) {
          const subscribers = Array.from({ length: 20000 }, (_, i) => ({
            telegramId: 1000000 + i,
          }));
          return [subscribers];
        }
        return [[]];
      }),
    };

    const worker = new BroadcastWorker(mockMessenger, mockSubscriberRepo, mockDb);
    
    await worker.enqueue(123456, 1, 123456);
    await new Promise((resolve) => setTimeout(resolve, 15000));

    const report = RateLimitAnalyzer.generateReport(timestamps, 20000);
    console.log(report);

    const analysis = RateLimitAnalyzer.analyzeTimestamps(timestamps);
    expect(analysis.violations).toBe(0);
    expect(analysis.avgMessagesPerSecond).toBeLessThanOrEqual(28);
    expect(analysis.maxMessagesInWindow).toBeLessThanOrEqual(30);
  }, 20000);
});
