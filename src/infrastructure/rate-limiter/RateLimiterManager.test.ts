import { RateLimiterManager } from "./RateLimiterManager";

jest.mock("../logger", () => ({ GetLogger: () => ({ info() {}, error() {}, warn() {}, debug() {} }) }));

const manager = () => new RateLimiterManager({} as any) as any;

describe("retry policy", () => {
  it("retries a network error at most 3 times", () => {
    const m = manager();
    expect(m.retryDelay({ code: "ETIMEDOUT" }, 2, "msg-1")).toBe(7000);
    expect(m.retryDelay({ code: "ETIMEDOUT" }, 3, "msg-1")).toBeNull();
  });

  it("always honours Telegram's retry_after", () => {
    const error = { response: { error_code: 429, parameters: { retry_after: 10 } } };
    expect(manager().retryDelay(error, 8, "msg-1")).toBe(15000);
  });

  it("does not retry other errors", () => {
    expect(manager().retryDelay(new Error("bad request"), 0, "msg-1")).toBeNull();
  });
});
