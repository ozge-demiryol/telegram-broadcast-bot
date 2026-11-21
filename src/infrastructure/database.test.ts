import { Database } from "./database";

const mockPool = { getConnection: jest.fn(), end: jest.fn() };

jest.mock("mysql2/promise", () => ({
  __esModule: true,
  default: { createPool: jest.fn(() => mockPool) },
}));
jest.mock("../config/config", () => ({
  CONFIG: { DB: { HOST: "h", PORT: 3306, USER: "u", PASSWORD: "p", DATABASE: "d" }, LOG_LEVEL: "info" },
}));
jest.mock("../infrastructure/logger", () => ({
  GetLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }),
}));

describe("Database.getInstance", () => {
  // Repositories keep the pool they were given at startup. If a failed startup check ended
  // that pool, every later query would fail with "Pool is closed" even once MySQL is back.
  it("does not close the pool when the startup connection check fails", async () => {
    mockPool.getConnection.mockRejectedValue(new Error("connect ECONNREFUSED"));

    const pool = Database.getInstance();
    await new Promise(setImmediate); // let the rejected validation promise settle

    expect(mockPool.end).not.toHaveBeenCalled();
    expect(Database.getInstance()).toBe(pool);
  });
});
