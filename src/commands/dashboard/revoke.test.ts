import { Telegraf, Telegram } from "telegraf";
import { revokeCommand } from "./revoke";

let updateId = 0;
const revoke = (from: number, payload = ""): any => {
  const text = `/revoke${payload ? " " + payload : ""}`;
  return {
    update_id: ++updateId,
    message: {
      message_id: updateId, date: 0, text,
      chat: { id: from, type: "private" }, from: { id: from, is_bot: false, first_name: "u" },
      entities: [{ type: "bot_command", offset: 0, length: "/revoke".length }],
    },
  };
};

// `username` holds username || first_name (see subscribe.ts), so it is neither unique nor stable.
const sub = (telegramId: number, username: string, isAdmin: boolean) => ({ telegramId, username, isAdmin });

describe("/revoke", () => {
  let bot: Telegraf;
  let api: jest.SpyInstance;
  const repo = { findByTelegramId: jest.fn(), findByUsername: jest.fn(), setAdminStatus: jest.fn() };
  const replies = () => api.mock.calls.filter((c) => c[0] === "sendMessage").map((c) => c[1].text as string);

  beforeEach(() => {
    jest.clearAllMocks();
    bot = new Telegraf("123:FAKE");
    bot.botInfo = { id: 1, is_bot: true, first_name: "bot", username: "bot", can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false } as any;
    api = jest.spyOn(Telegram.prototype, "callApi").mockResolvedValue({ message_id: 1 } as any);
    revokeCommand(bot, repo as any);
  });
  afterEach(() => { api.mockRestore(); jest.restoreAllMocks(); });

  it("revokes another admin's privileges by telegramId", async () => {
    repo.findByTelegramId.mockResolvedValue(sub(1, "alice", true));
    repo.findByUsername.mockResolvedValue(sub(2, "bob", true));
    await bot.handleUpdate(revoke(1, "@bob"));
    expect(repo.setAdminStatus).toHaveBeenCalledWith(2, false);
    expect(replies()).toEqual(["✅ Admin privileges revoked from @bob"]);
  });

  it("an admin cannot revoke themselves", async () => {
    repo.findByTelegramId.mockResolvedValue(sub(1, "alice", true));
    repo.findByUsername.mockResolvedValue(sub(1, "alice", true));
    await bot.handleUpdate(revoke(1, "alice"));
    expect(repo.setAdminStatus).not.toHaveBeenCalled();
    expect(replies()).toEqual(["You cannot revoke your own admin privileges."]);
  });

  it("two different admins with the same display name: the other one can still be revoked", async () => {
    repo.findByTelegramId.mockResolvedValue(sub(1, "Ali", true));
    repo.findByUsername.mockResolvedValue(sub(2, "Ali", true));
    await bot.handleUpdate(revoke(1, "Ali"));
    expect(repo.setAdminStatus).toHaveBeenCalledWith(2, false);
  });

  it("a non-admin is denied and nothing is looked up", async () => {
    repo.findByTelegramId.mockResolvedValue(sub(3, "mallory", false));
    await bot.handleUpdate(revoke(3, "alice"));
    expect(replies()).toEqual(["Access denied. Admin only."]);
    expect(repo.findByUsername).not.toHaveBeenCalled();
    expect(repo.setAdminStatus).not.toHaveBeenCalled();
  });

  it("shows usage without a username", async () => {
    repo.findByTelegramId.mockResolvedValue(sub(1, "alice", true));
    await bot.handleUpdate(revoke(1));
    expect(replies()[0]).toMatch(/^Usage:/);
    expect(repo.setAdminStatus).not.toHaveBeenCalled();
  });

  it("reports an unknown user", async () => {
    repo.findByTelegramId.mockResolvedValue(sub(1, "alice", true));
    repo.findByUsername.mockResolvedValue(null);
    await bot.handleUpdate(revoke(1, "ghost"));
    expect(replies()).toEqual(["User not found."]);
    expect(repo.setAdminStatus).not.toHaveBeenCalled();
  });

  it("reports a target who is not an admin", async () => {
    repo.findByTelegramId.mockResolvedValue(sub(1, "alice", true));
    repo.findByUsername.mockResolvedValue(sub(2, "bob", false));
    await bot.handleUpdate(revoke(1, "bob"));
    expect(replies()).toEqual(["User is not an admin."]);
    expect(repo.setAdminStatus).not.toHaveBeenCalled();
  });
});
