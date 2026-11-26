import { Telegraf, Telegram } from "telegraf";
import { broadcastCommand } from "./broadcast";

jest.mock("../../infrastructure/logger", () => ({
  GetLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }),
}));

let updateId = 0;
const press = (from: number, data: string): any => ({
  update_id: ++updateId,
  callback_query: {
    id: String(updateId), chat_instance: "x", data,
    from: { id: from, is_bot: false, first_name: "u" },
    message: { message_id: 50, date: 0, chat: { id: from, type: "private" } },
  },
});

const ADMIN = 1;
const STRANGER = 2;

describe("broadcast buttons", () => {
  let bot: Telegraf;
  let api: jest.SpyInstance;
  const subscribers = { findByTelegramId: jest.fn() };
  const broadcasts = { getOngoingBroadcasts: jest.fn(), createBroadcast: jest.fn(), cancel: jest.fn() };
  const worker = { wake: jest.fn(), stopBroadcast: jest.fn(), runningJobId: null as number | null };
  const calls = (method: string) => api.mock.calls.filter((c) => c[0] === method).map((c) => c[1]);

  beforeEach(() => {
    jest.clearAllMocks();
    subscribers.findByTelegramId.mockImplementation(async (id: number) => (id === ADMIN ? { isAdmin: true } : null));
    broadcasts.getOngoingBroadcasts.mockResolvedValue([]);
    worker.runningJobId = 7;
    broadcasts.createBroadcast.mockResolvedValue(true);
    broadcasts.cancel.mockResolvedValue(true);
    bot = new Telegraf("123:FAKE");
    bot.botInfo = { id: 1, is_bot: true, first_name: "bot", username: "bot", can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false } as any;
    api = jest.spyOn(Telegram.prototype, "callApi").mockResolvedValue({ message_id: 1 } as any);
    broadcastCommand(bot, subscribers as any, broadcasts as any, worker as any);
  });
  afterEach(() => { api.mockRestore(); jest.restoreAllMocks(); });

  it("an admin pressing Confirm creates and starts the broadcast", async () => {
    await bot.handleUpdate(press(ADMIN, "confirm_bc_5"));
    expect(broadcasts.createBroadcast).toHaveBeenCalledWith(ADMIN, 5, ADMIN);
    expect(worker.wake).toHaveBeenCalled();
  });

  it("a non-admin pressing Confirm cannot start a broadcast", async () => {
    await bot.handleUpdate(press(STRANGER, "confirm_bc_5"));
    expect(broadcasts.createBroadcast).not.toHaveBeenCalled();
    expect(worker.wake).not.toHaveBeenCalled();
    expect(calls("editMessageText")).toHaveLength(0);
    expect(calls("answerCallbackQuery")).toEqual([
      expect.objectContaining({ text: "Only admins can use this button.", show_alert: true }),
    ]);
  });

  it("a revoked admin's old Confirm button no longer starts a broadcast", async () => {
    subscribers.findByTelegramId.mockResolvedValue({ isAdmin: false });
    await bot.handleUpdate(press(ADMIN, "confirm_bc_5"));
    expect(broadcasts.createBroadcast).not.toHaveBeenCalled();
    expect(worker.wake).not.toHaveBeenCalled();
  });

  it("a non-admin pressing Stop cannot stop a running broadcast", async () => {
    await bot.handleUpdate(press(STRANGER, "stop_broadcast"));
    expect(worker.stopBroadcast).not.toHaveBeenCalled();
  });

  it("an admin pressing Stop stops the running broadcast", async () => {
    await bot.handleUpdate(press(ADMIN, "stop_broadcast"));
    expect(worker.stopBroadcast).toHaveBeenCalledTimes(1);
  });

  it("Stop cancels the broadcast it belongs to, in the database first", async () => {
    await bot.handleUpdate(press(ADMIN, "stop_broadcast_3"));
    expect(broadcasts.cancel).toHaveBeenCalledWith(3);
    expect(worker.stopBroadcast).toHaveBeenCalledWith(3);
  });

  it("Stop on a finished broadcast stops nothing", async () => {
    broadcasts.cancel.mockResolvedValue(false);
    await bot.handleUpdate(press(ADMIN, "stop_broadcast_3"));
    expect(worker.stopBroadcast).not.toHaveBeenCalled();
    expect(calls("sendMessage")[0]).toEqual(expect.objectContaining({ text: expect.stringContaining("already finished") }));
  });

  it("confirming the same message twice does not start it again", async () => {
    broadcasts.createBroadcast.mockResolvedValue(false);
    await bot.handleUpdate(press(ADMIN, "confirm_bc_5"));
    expect(worker.wake).not.toHaveBeenCalled();
    expect(calls("answerCallbackQuery")).toEqual([expect.objectContaining({ text: expect.stringContaining("already") })]);
  });

  it("a non-admin pressing Cancel does not edit the confirmation message", async () => {
    await bot.handleUpdate(press(STRANGER, "cancel_bc"));
    expect(calls("editMessageText")).toHaveLength(0);
  });

  it("an admin pressing Cancel edits the confirmation message", async () => {
    await bot.handleUpdate(press(ADMIN, "cancel_bc"));
    expect(calls("editMessageText")).toHaveLength(1);
  });
});
