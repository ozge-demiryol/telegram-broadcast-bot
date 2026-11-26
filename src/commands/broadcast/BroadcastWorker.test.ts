import { Readable } from "stream";
import { BroadcastWorker } from "./BroadcastWorker";

const mockLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };

jest.mock("../../infrastructure/logger", () => ({ GetLogger: () => mockLogger }));
jest.mock("../../config/config", () => ({
  CONFIG: { TELEGRAM: { CHUNK_SIZE: 1000, PAGE_SIZE: 500 }, DRY_RUN: false },
}));

const settleAsync = () => new Promise(setImmediate);

describe("BroadcastWorker startup", () => {
  beforeEach(() => jest.clearAllMocks());

  // The constructor starts initSpeed() without awaiting it, so a failure there used to
  // become an unhandled rejection at startup.
  it("logs instead of rejecting when saving the initial speed fails", async () => {
    const settings = {
      getBroadcastLimit: jest.fn().mockResolvedValue(5),
      setBroadcastLimit: jest.fn().mockRejectedValue(new Error("db down")),
    };

    new BroadcastWorker({} as any, {} as any, {} as any, settings as any);
    await settleAsync();

    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("speed"), expect.any(Error));
  });

  it("logs the initialized speed when everything works", async () => {
    const settings = {
      getBroadcastLimit: jest.fn().mockResolvedValue(8),
      setBroadcastLimit: jest.fn().mockResolvedValue(undefined),
    };

    new BroadcastWorker({} as any, {} as any, {} as any, settings as any);
    await settleAsync();

    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith("Initialized with speed: 8 msg/sec");
  });
});

// In-memory stand-in with the same conditional updates as the SQL repository.
function fakeRepo() {
  const jobs: any[] = [];
  const repo = {
    jobs,
    add: () => {
      jobs.push({ id: jobs.length + 1, admin_id: 9, chat_id: 9, message_id: jobs.length + 1, status: "pending",
        last_subscriber_id: 0, sent_count: 0, failed_count: 0, blocked_count: 0, attempts: 0 });
      return jobs[jobs.length - 1];
    },
    claimNext: jest.fn(async () => {
      const job = jobs.find((j) => j.status === "pending");
      if (!job) return null;
      job.status = "processing";
      job.attempts++;
      return { ...job };
    }),
    requeueInterrupted: jest.fn(async () => {
      jobs.filter((j) => j.status === "processing").forEach((j) => (j.status = "pending"));
    }),
    saveProgress: jest.fn(async (id: number, progress: object) => {
      Object.assign(jobs[id - 1], progress);
    }),
    finish: jest.fn(async (id: number, status: string) => {
      const job = jobs[id - 1];
      if (job.status === "processing") job.status = status;
    }),
  };
  return repo;
}

const people = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, telegramId: 101 + i }));
const subscribers = {
  countTotalSubcribers: async () => people.length,
  getSubscribersStream: (lastId: number) => Readable.from(people.filter((p) => p.id > lastId)),
  setActiveStatus: jest.fn(),
};
const settings = { getBroadcastLimit: async () => 30, setBroadcastLimit: async () => {} };

function setup(repo = fakeRepo()) {
  const messenger = {
    copyMessage: jest.fn(async (_to: number, _from: number, _messageId: number) => {}),
    sendMessage: jest.fn(async (_to: number, _text: string, _extra?: any) => {}),
  };
  const worker = new BroadcastWorker(messenger, subscribers as any, repo as any, settings as any);
  const sentTo = () => messenger.copyMessage.mock.calls.map((c) => c[0]);
  const texts = () => messenger.sendMessage.mock.calls.map((c) => c[1]);
  return { repo, messenger, worker, sentTo, texts };
}

async function until(condition: () => boolean) {
  for (let i = 0; i < 400 && !condition(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(condition()).toBe(true);
}

const everyone = people.map((p) => p.telegramId);

describe("BroadcastWorker queue", () => {
  beforeEach(() => jest.clearAllMocks());

  it("runs one loop even when woken twice in the same tick", async () => {
    const { repo, worker, sentTo, texts } = setup();
    repo.add();

    worker.wake();
    worker.wake();
    await until(() => repo.jobs[0].status === "completed");
    await new Promise((r) => setTimeout(r, 100));

    expect(sentTo()).toEqual(everyone);
    expect(texts().filter((t) => t.includes("Finished"))).toEqual([expect.stringContaining("Sent: 10\n")]);
  });

  it("does not miss a job added while the previous one is finishing", async () => {
    const { repo, worker } = setup();
    repo.add();
    repo.finish.mockImplementationOnce(async (id: number) => {
      repo.jobs[id - 1].status = "completed";
      repo.add();
      worker.wake();
    });

    worker.wake();
    await until(() => repo.jobs[1]?.status === "completed");
  });

  it("resumes where it stopped after the process dies mid-broadcast", async () => {
    const first = setup();
    first.repo.add();
    // the 5th send never returns: from the DB's point of view the process died here
    first.messenger.copyMessage.mockImplementation((to: number) => (to === 105 ? new Promise<void>(() => {}) : Promise.resolve()));
    first.worker.wake();
    await until(() => first.sentTo().includes(105));
    expect(first.repo.jobs[0]).toMatchObject({ status: "processing", last_subscriber_id: 4, sent_count: 4 });

    const second = setup(first.repo); // restarted process, same database
    second.worker.wake();
    await until(() => first.repo.jobs[0].status === "completed");

    expect(second.sentTo()).toEqual(everyone.slice(4)); // only #5 was attempted twice
    expect(second.texts()[0]).toContain("resumed");
    expect(second.texts().at(-1)).toContain("Sent: 10\n");
  });

  it("still finishes the broadcast when the admin cannot be messaged", async () => {
    const { repo, worker, messenger, sentTo } = setup();
    repo.add();
    messenger.sendMessage.mockRejectedValue(new Error("bot was blocked by the user"));

    worker.wake();
    await until(() => repo.jobs[0].status === "completed");
    expect(sentTo()).toEqual(everyone);
  });
});
