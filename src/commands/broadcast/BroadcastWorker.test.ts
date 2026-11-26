import { BroadcastWorker } from "./BroadcastWorker";

const mockLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };

jest.mock("../../infrastructure/logger", () => ({ GetLogger: () => mockLogger }));
jest.mock("../../config/config", () => ({
  CONFIG: { TELEGRAM: { CHUNK_SIZE: 25, PAGE_SIZE: 500 }, DRY_RUN: false },
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
