import { BroadcastWorker } from "../../src/commands/broadcast/BroadcastWorker";
import { IMessenger } from "../../src/infrastructure/telegram/IMessenger";
import { ISubscriberRepository } from "../../src/repositories/ISubscriberRepository";

describe("BroadcastWorker Edge Cases & Failure Scenarios", () => {
  let mockMessenger: jest.Mocked<IMessenger>;
  let mockSubscriberRepo: jest.Mocked<ISubscriberRepository>;
  let mockDb: any;
  let broadcasts: any[];

  beforeEach(() => {
    broadcasts = [];
    mockMessenger = {
      copyMessage: jest.fn(),
      forwardMessage: jest.fn(),
      sendMessage: jest.fn(),
    };
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
          return [[{ count: 0 }]];
        }
        if (sql.includes("SELECT telegramId FROM subscribers WHERE isActive = 1")) {
          return [[]];
        }
        return [[]];
      }),
    };
  });

  test("EDGE: zero subscribers", async () => {
    const worker = new BroadcastWorker(mockMessenger, mockSubscriberRepo, mockDb);
    await worker.enqueue(123456, 1, 123456);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(mockMessenger.copyMessage).not.toHaveBeenCalled();
    expect(mockMessenger.sendMessage).toHaveBeenCalledWith(
      123456,
      expect.stringContaining("Completed")
    );
  });

  test("EDGE: single subscriber", async () => {
    mockDb.query = jest.fn().mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes("SELECT telegramId FROM subscribers WHERE isActive = 1")) {
        return [[{ telegramId: 123 }]];
      }
      if (sql.includes("SELECT COUNT(*) as count FROM subscribers")) {
        return [[{ count: 1 }]];
      }
      if (sql.includes("SELECT * FROM broadcasts WHERE status IN")) {
        return [broadcasts.filter((b) => ["pending", "processing"].includes(b.status))];
      }
      if (sql.includes("INSERT INTO broadcasts")) {
        const newBroadcast = { id: 1, admin_id: params![0], message_id: params![1], chat_id: params![2], status: "pending", created_at: new Date() };
        broadcasts.push(newBroadcast);
        return [{ insertId: 1 }];
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
      return [[]];
    });

    const worker = new BroadcastWorker(mockMessenger, mockSubscriberRepo, mockDb);
    await worker.enqueue(123456, 1, 123456);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(mockMessenger.copyMessage).toHaveBeenCalledTimes(1);
  });

  test("EDGE: all subscribers blocked bot (403 errors)", async () => {
    mockDb.query = jest.fn().mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes("SELECT telegramId FROM subscribers WHERE isActive = 1")) {
        return [Array.from({ length: 100 }, (_, i) => ({ telegramId: 1000 + i }))];
      }
      if (sql.includes("SELECT COUNT(*) as count FROM subscribers")) {
        return [[{ count: 100 }]];
      }
      if (sql.includes("SELECT * FROM broadcasts WHERE status IN")) {
        return [broadcasts.filter((b) => ["pending", "processing"].includes(b.status))];
      }
      if (sql.includes("INSERT INTO broadcasts")) {
        const newBroadcast = { id: 1, admin_id: params![0], message_id: params![1], chat_id: params![2], status: "pending", created_at: new Date() };
        broadcasts.push(newBroadcast);
        return [{ insertId: 1 }];
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
      return [[]];
    });

    mockMessenger.copyMessage.mockRejectedValue({
      response: { error_code: 403, description: "Forbidden: bot was blocked by the user" },
    });

    const worker = new BroadcastWorker(mockMessenger, mockSubscriberRepo, mockDb);
    await worker.enqueue(123456, 1, 123456);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    expect(mockSubscriberRepo.setActiveStatus).toHaveBeenCalledTimes(100);
    expect(mockMessenger.sendMessage).toHaveBeenCalledWith(
      123456,
      expect.stringContaining("Failed: 100")
    );
  }, 5000);

  test("EDGE: intermittent 429 errors", async () => {
    let callCount = 0;
    mockDb.query = jest.fn().mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes("SELECT telegramId FROM subscribers WHERE isActive = 1")) {
        return [Array.from({ length: 500 }, (_, i) => ({ telegramId: 1000 + i }))];
      }
      if (sql.includes("SELECT COUNT(*) as count FROM subscribers")) {
        return [[{ count: 500 }]];
      }
      if (sql.includes("SELECT * FROM broadcasts WHERE status IN")) {
        return [broadcasts.filter((b) => ["pending", "processing"].includes(b.status))];
      }
      if (sql.includes("INSERT INTO broadcasts")) {
        const newBroadcast = { id: 1, admin_id: params![0], message_id: params![1], chat_id: params![2], status: "pending", created_at: new Date() };
        broadcasts.push(newBroadcast);
        return [{ insertId: 1 }];
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
      return [[]];
    });

    mockMessenger.copyMessage.mockImplementation(async () => {
      callCount++;
      if (callCount % 50 === 0) {
        throw { response: { error_code: 429, parameters: { retry_after: 1 } } };
      }
    });

    const worker = new BroadcastWorker(mockMessenger, mockSubscriberRepo, mockDb);
    await worker.enqueue(123456, 1, 123456);
    await new Promise((resolve) => setTimeout(resolve, 5000));

    expect(mockMessenger.copyMessage).toHaveBeenCalled();
  }, 10000);

  test("EDGE: network timeout errors", async () => {
    mockDb.query = jest.fn().mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes("SELECT telegramId FROM subscribers WHERE isActive = 1")) {
        return [Array.from({ length: 100 }, (_, i) => ({ telegramId: 1000 + i }))];
      }
      if (sql.includes("SELECT COUNT(*) as count FROM subscribers")) {
        return [[{ count: 100 }]];
      }
      if (sql.includes("SELECT * FROM broadcasts WHERE status IN")) {
        return [broadcasts.filter((b) => ["pending", "processing"].includes(b.status))];
      }
      if (sql.includes("INSERT INTO broadcasts")) {
        const newBroadcast = { id: 1, admin_id: params![0], message_id: params![1], chat_id: params![2], status: "pending", created_at: new Date() };
        broadcasts.push(newBroadcast);
        return [{ insertId: 1 }];
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
      return [[]];
    });

    mockMessenger.copyMessage.mockRejectedValue(new Error("ETIMEDOUT"));

    const worker = new BroadcastWorker(mockMessenger, mockSubscriberRepo, mockDb);
    await worker.enqueue(123456, 1, 123456);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    expect(mockMessenger.sendMessage).toHaveBeenCalledWith(
      123456,
      expect.stringContaining("Failed: 100")
    );
  }, 5000);

  test("EDGE: multiple concurrent broadcasts (race condition)", async () => {
    mockDb.query = jest.fn().mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes("SELECT telegramId FROM subscribers WHERE isActive = 1")) {
        return [Array.from({ length: 1000 }, (_, i) => ({ telegramId: 1000 + i }))];
      }
      if (sql.includes("SELECT COUNT(*) as count FROM subscribers")) {
        return [[{ count: 1000 }]];
      }
      if (sql.includes("SELECT * FROM broadcasts WHERE status IN")) {
        return [broadcasts.filter((b) => ["pending", "processing"].includes(b.status))];
      }
      if (sql.includes("INSERT INTO broadcasts")) {
        const newBroadcast = { id: broadcasts.length + 1, admin_id: params![0], message_id: params![1], chat_id: params![2], status: "pending", created_at: new Date() };
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
      return [[]];
    });

    const worker = new BroadcastWorker(mockMessenger, mockSubscriberRepo, mockDb);
    
    await Promise.all([
      worker.enqueue(111, 1, 111),
      worker.enqueue(222, 2, 222),
      worker.enqueue(333, 3, 333),
    ]);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    expect(broadcasts.length).toBe(3);
    expect(broadcasts.filter((b) => b.status === "processing").length).toBeLessThanOrEqual(1);
  }, 5000);

  test("EDGE: database connection failure during broadcast", async () => {
    let queryCount = 0;
    mockDb.query = jest.fn().mockImplementation(async (sql: string, params?: any[]) => {
      queryCount++;
      if (queryCount > 5 && sql.includes("UPDATE broadcasts SET status = 'completed'")) {
        throw new Error("Connection lost");
      }
      if (sql.includes("SELECT telegramId FROM subscribers WHERE isActive = 1")) {
        return [Array.from({ length: 10 }, (_, i) => ({ telegramId: 1000 + i }))];
      }
      if (sql.includes("SELECT COUNT(*) as count FROM subscribers")) {
        return [[{ count: 10 }]];
      }
      if (sql.includes("SELECT * FROM broadcasts WHERE status IN")) {
        return [broadcasts.filter((b) => ["pending", "processing"].includes(b.status))];
      }
      if (sql.includes("INSERT INTO broadcasts")) {
        const newBroadcast = { id: 1, admin_id: params![0], message_id: params![1], chat_id: params![2], status: "pending", created_at: new Date() };
        broadcasts.push(newBroadcast);
        return [{ insertId: 1 }];
      }
      if (sql.includes("SELECT * FROM broadcasts WHERE status = 'pending'")) {
        return [broadcasts.filter((b) => b.status === "pending")];
      }
      if (sql.includes("UPDATE broadcasts SET status = 'processing'")) {
        const broadcast = broadcasts.find((b) => b.id === params![0]);
        if (broadcast) broadcast.status = "processing";
        return [{ affectedRows: 1 }];
      }
      return [[]];
    });

    const worker = new BroadcastWorker(mockMessenger, mockSubscriberRepo, mockDb);
    await worker.enqueue(123456, 1, 123456);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    expect(mockMessenger.copyMessage).toHaveBeenCalled();
  }, 5000);

  test("EDGE: extremely slow network (high latency)", async () => {
    const timestamps: number[] = [];
    mockDb.query = jest.fn().mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes("SELECT telegramId FROM subscribers WHERE isActive = 1")) {
        return [Array.from({ length: 200 }, (_, i) => ({ telegramId: 1000 + i }))];
      }
      if (sql.includes("SELECT COUNT(*) as count FROM subscribers")) {
        return [[{ count: 200 }]];
      }
      if (sql.includes("SELECT * FROM broadcasts WHERE status IN")) {
        return [broadcasts.filter((b) => ["pending", "processing"].includes(b.status))];
      }
      if (sql.includes("INSERT INTO broadcasts")) {
        const newBroadcast = { id: 1, admin_id: params![0], message_id: params![1], chat_id: params![2], status: "pending", created_at: new Date() };
        broadcasts.push(newBroadcast);
        return [{ insertId: 1 }];
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
      return [[]];
    });

    mockMessenger.copyMessage.mockImplementation(async () => {
      timestamps.push(Date.now());
      await new Promise((resolve) => setTimeout(resolve, 200)); // 200ms latency
    });

    const worker = new BroadcastWorker(mockMessenger, mockSubscriberRepo, mockDb);
    await worker.enqueue(123456, 1, 123456);
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const duration = (timestamps[timestamps.length - 1] - timestamps[0]) / 1000;
    const messagesPerSecond = timestamps.length / duration;
    
    expect(messagesPerSecond).toBeLessThanOrEqual(30);
  }, 10000);
});
