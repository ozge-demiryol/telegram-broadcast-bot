import { BroadcastWorker } from "../../src/commands/broadcast/BroadcastWorker";
import { IMessenger } from "../../src/infrastructure/telegram/IMessenger";
import { ISubscriberRepository } from "../../src/repositories/ISubscriberRepository";
import { IBroadcastRepository } from "../../src/repositories/broadcast/IBroadcastRepository";

describe("BroadcastWorker Integration Tests - Rate Limiting", () => {
  let worker: BroadcastWorker;
  let mockMessenger: jest.Mocked<IMessenger>;
  let mockSubscriberRepo: jest.Mocked<ISubscriberRepository>;
  let mockBroadcastRepo: jest.Mocked<IBroadcastRepository>;
  let mockDb: any;
  let messageTimestamps: number[] = [];

  beforeEach(() => {
    messageTimestamps = [];

    // Mock Messenger with timestamp tracking
    mockMessenger = {
      copyMessage: jest.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5)); // Simulate network latency
        messageTimestamps.push(Date.now()); // Record timestamp AFTER the operation completes
      }),
      forwardMessage: jest.fn(),
      sendMessage: jest.fn(),
    };

    // Mock Subscriber Repository
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

    mockBroadcastRepo = {
      createBroadcast: jest.fn(),
      getOngoingBroadcasts: jest.fn(),
      getNextPendingBroadcast: jest.fn(),
      updateStatus: jest.fn(),
    };

    // Mock Database
    const broadcasts: any[] = [];
    mockDb = {
      query: jest
        .fn()
        .mockImplementation(async (sql: string, params?: any[]) => {
          if (sql.includes("SELECT * FROM broadcasts WHERE status IN")) {
            return [
              broadcasts.filter((b) =>
                ["pending", "processing"].includes(b.status)
              ),
            ];
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
          if (
            sql.includes("SELECT * FROM broadcasts WHERE status = 'pending'")
          ) {
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
          if (
            sql.includes(
              "SELECT telegramId FROM subscribers WHERE isActive = 1"
            )
          ) {
            const subscribers = Array.from({ length: 20000 }, (_, i) => ({
              telegramId: 1000000 + i,
            }));
            return [subscribers];
          }
          return [[]];
        }),
    };

    worker = new BroadcastWorker(
      mockMessenger,
      mockSubscriberRepo,
      mockBroadcastRepo,
      mockDb
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("should respect rate limit of ~25 messages per second for 20k subscribers", async () => {
    await worker.enqueue(123456, 1, 123456);
    await new Promise((resolve) => setTimeout(resolve, 15000)); // Wait 15 seconds

    // Calculate messages per second
    const duration =
      (messageTimestamps[messageTimestamps.length - 1] - messageTimestamps[0]) /
      1000;
    const messagesPerSecond = messageTimestamps.length / duration;

    expect(messagesPerSecond).toBeLessThanOrEqual(25); // Telegram's hard limit
    expect(messagesPerSecond).toBeGreaterThanOrEqual(20); // Should be efficient
    expect(messagesPerSecond).toBeLessThanOrEqual(28); // Our safe zone
  }, 20000);

  test("should not exceed 30 messages in any 1-second window", async () => {
    await worker.enqueue(123456, 1, 123456);
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Reduced to 5 seconds for realistic test

    // Check sliding window of 1 second
    let maxInWindow = 0;
    for (let i = 0; i < messageTimestamps.length; i++) {
      const windowStart = messageTimestamps[i];
      const windowEnd = windowStart + 1000;
      const messagesInWindow = messageTimestamps.filter(
        (ts) => ts >= windowStart && ts < windowEnd
      ).length;
      maxInWindow = Math.max(maxInWindow, messagesInWindow);

      if (messagesInWindow > 30) {
        console.log(
          `Window violation at index ${i}: ${messagesInWindow} messages`
        );
        console.log(`Window: ${windowStart} - ${windowEnd}`);
      }

      expect(messagesInWindow).toBeLessThanOrEqual(30);
    }
    console.log(`Max messages in any 1s window: ${maxInWindow}`);
  }, 15000);

  test("should handle 20k+ subscribers without memory issues", async () => {
    const initialMemory = process.memoryUsage().heapUsed;

    await worker.enqueue(123456, 1, 123456);
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncreaseMB = (finalMemory - initialMemory) / 1024 / 1024;

    expect(memoryIncreaseMB).toBeLessThan(100); // Should not use excessive memory
  }, 10000);

  test("should maintain max 5 concurrent requests", async () => {
    let concurrentCalls = 0;
    let maxConcurrent = 0;

    mockMessenger.copyMessage.mockImplementation(async () => {
      concurrentCalls++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
      await new Promise((resolve) => setTimeout(resolve, 50));
      messageTimestamps.push(Date.now()); // Record AFTER delay
      concurrentCalls--;
    });

    await worker.enqueue(123456, 1, 123456);
    await new Promise((resolve) => setTimeout(resolve, 5000));

    expect(maxConcurrent).toBeLessThanOrEqual(5);
  }, 10000);

  test("should queue second broadcast and estimate wait time", async () => {
    await worker.enqueue(123456, 1, 123456);
    await new Promise((resolve) => setTimeout(resolve, 100));

    await worker.enqueue(789012, 2, 789012);

    expect(mockMessenger.sendMessage).toHaveBeenCalledWith(
      789012,
      expect.stringContaining("queued")
    );
    expect(mockMessenger.sendMessage).toHaveBeenCalledWith(
      789012,
      expect.stringMatching(/~\d+ minutes/)
    );
  });

  test("should complete 20k broadcasts in expected time range", async () => {
    const startTime = Date.now();

    await worker.enqueue(123456, 1, 123456);
    await new Promise((resolve) => setTimeout(resolve, 15000));

    const duration = (Date.now() - startTime) / 1000;
    const expectedMinTime = 20000 / 30; // 30 msg/sec (best case)
    const expectedMaxTime = 20000 / 20; // 20 msg/sec (worst case)

    expect(duration).toBeGreaterThanOrEqual(expectedMinTime * 0.8);
    expect(duration).toBeLessThanOrEqual(expectedMaxTime * 1.2);
  }, 20000);

  test("should report progress to admin every 250 messages", async () => {
    const subscriberCount = 500;
    const adminId = 123456;

    // Mock 500 active subscribers
    mockSubscriberRepo.findAllActive.mockResolvedValue(
      Array.from({ length: subscriberCount }, (_, i) => ({
        telegramId: 2000000 + i,
        isActive: true,
      })) as any
    );

    // Track calls to sendMessage specifically for progress updates
    const progressMessages: string[] = [];
    mockMessenger.sendMessage.mockImplementation(async (id, text) => {
      if (id === adminId && text.includes("📊 Progress:")) {
        progressMessages.push(text);
      }
    });

    // Enqueue the job and wait for it to process
    await worker.enqueue(adminId, 1, 123456);

    // Use a small delay to allow the async loop and limiter to finish 500 small tasks
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Assertions
    // 1. Check if progress was reported at 250
    expect(progressMessages).toContain("📊 Progress: 250 users reached...");

    // 2. Check if progress was reported at 500
    expect(progressMessages).toContain("📊 Progress: 500 users reached...");

    // 3. Ensure it was called exactly twice for progress (at 250 and 500)
    const totalProgressCalls = progressMessages.length;
    expect(totalProgressCalls).toBe(2);

    // 4. Verify the final completion message was also sent (separate from progress)
    expect(mockMessenger.sendMessage).toHaveBeenCalledWith(
      adminId,
      expect.stringContaining("✅ Broadcast Completed!")
    );
  });
});
