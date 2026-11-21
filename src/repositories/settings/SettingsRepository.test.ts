import { SettingsRepository } from "./SettingsRepository";

jest.mock("../../infrastructure/logger", () => ({
  GetLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }),
}));

const repoWithStoredSpeed = (value: string | undefined) => {
  const execute = jest.fn().mockResolvedValue([value === undefined ? [] : [{ setting_value: value }]]);
  return new SettingsRepository({ execute } as any);
};

describe("SettingsRepository.getBroadcastLimit", () => {
  it.each([
    ["5", 5],
    ["30", 30],
    ["0.5", 0.5], // /speed accepts down to 0.5 msg/sec, so a restart must not turn it into 0
    ["2.5", 2.5],
  ])("reads the stored speed %s as %d", async (stored, expected) => {
    expect(await repoWithStoredSpeed(stored).getBroadcastLimit()).toBe(expected);
  });

  it("falls back to the default speed when nothing is stored", async () => {
    expect(await repoWithStoredSpeed(undefined).getBroadcastLimit()).toBe(5);
  });
});
