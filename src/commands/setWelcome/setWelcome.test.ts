import { Telegraf, Telegram, TelegramError } from "telegraf";
import { setWelcomeCommand } from "./setWelcome";

jest.mock("../../infrastructure/logger", () => ({
  GetLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }),
}));

// adminStates is a module-level Map, so every test uses its own user ids.
let nextId = 1000;
const newUser = () => nextId++;

let updateId = 0;
const text = (from: number, t: string): any => ({
  update_id: ++updateId,
  message: {
    message_id: updateId, date: 0, text: t,
    chat: { id: from, type: "private" }, from: { id: from, is_bot: false, first_name: "u" },
    ...(t.startsWith("/") && !t.includes(" ")
      ? { entities: [{ type: "bot_command", offset: 0, length: t.length }] }
      : {}),
  },
});
const press = (from: number, data: string): any => ({
  update_id: ++updateId,
  callback_query: {
    id: String(updateId), chat_instance: "x", data,
    from: { id: from, is_bot: false, first_name: "u" },
    message: { message_id: 50, date: 0, chat: { id: from, type: "private" } },
  },
});

const tgError = (code: number, description: string) =>
  new TelegramError({ error_code: code, description }, { method: "sendMessage", payload: {} });
const PARSE_ERR = "Bad Request: can't parse entities: Can't find end of the entity starting at byte offset 5";

describe("/setwelcome flow", () => {
  let bot: Telegraf;
  let api: jest.SpyInstance;
  let failWith: ((method: string, payload: any) => Error | undefined) | undefined;
  const subscribers = { findByTelegramId: jest.fn() };
  const settings = { setWelcomeMessage: jest.fn() };

  const admins = new Set<number>();
  const admin = () => { const id = newUser(); admins.add(id); return id; };
  const send = (u: any) => bot.handleUpdate(u);
  const calls = (method: string) => api.mock.calls.filter((c) => c[0] === method).map((c) => c[1]);
  const sentTexts = () => calls("sendMessage").map((p) => p.text as string);
  const hasInlineButtons = () => calls("sendMessage").some((p) => p.reply_markup?.inline_keyboard);
  const clear = () => api.mockClear();
  const startDraft = async (id: number, draft = "Hello new users") => {
    await send(text(id, "/setwelcome"));
    await send(text(id, draft));
  };

  beforeEach(() => {
    jest.clearAllMocks();
    failWith = undefined;
    subscribers.findByTelegramId.mockImplementation(async (i: number) => (admins.has(i) ? { isAdmin: true } : null));
    bot = new Telegraf("123:FAKE");
    bot.botInfo = { id: 1, is_bot: true, first_name: "bot", username: "bot", can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false } as any;
    // Telegraf builds a new Telegram instance per update, so stub the prototype.
    api = jest.spyOn(Telegram.prototype, "callApi").mockImplementation((async (method: string, payload: any) => {
      const err = failWith?.(method, payload);
      if (err) throw err;
      return { message_id: 1 };
    }) as any);
    setWelcomeCommand(bot, subscribers as any, settings as any);
  });
  afterEach(() => { api.mockRestore(); jest.restoreAllMocks(); });

  describe("happy path", () => {
    it("shows preview and buttons, then saves exactly once on btn_save_welcome", async () => {
      const id = admin();
      await startDraft(id, "Welcome to the channel!");

      const previews = calls("sendMessage").filter((p) => p.parse_mode === "Markdown").map((p) => p.text);
      expect(previews).toEqual(expect.arrayContaining(["👁️ *Preview:*", "Welcome to the channel!"]));
      const prompt = calls("sendMessage").find((p) => p.text === "Does this look good?");
      const buttons = prompt.reply_markup.inline_keyboard.flat().map((b: any) => b.callback_data);
      expect(buttons).toEqual(["btn_save_welcome", "btn_rewrite_welcome", "btn_cancel_welcome"]);

      await send(press(id, "btn_save_welcome"));
      expect(settings.setWelcomeMessage).toHaveBeenCalledTimes(1);
      expect(settings.setWelcomeMessage).toHaveBeenCalledWith("Welcome to the channel!");
      expect(sentTexts().some((t) => t.includes("Success"))).toBe(true);
    });

    it("a second click on Save (state already reset) says session expired and does not save again", async () => {
      const id = admin();
      await startDraft(id);
      await send(press(id, "btn_save_welcome"));
      clear();
      await send(press(id, "btn_save_welcome"));
      expect(calls("answerCallbackQuery")[0].text).toMatch(/Session expired/);
      expect(settings.setWelcomeMessage).toHaveBeenCalledTimes(1);
    });

    it("accepts exactly 5 characters", async () => {
      const id = admin();
      await startDraft(id, "12345");
      expect(sentTexts()).toContain("Does this look good?");
    });
  });

  describe("preview errors", () => {
    it("400 parse error: warns with Telegram's description, no buttons, no save, state stays AWAITING_INPUT", async () => {
      const id = admin();
      await send(text(id, "/setwelcome"));
      failWith = (m, p) => (m === "sendMessage" && p.text === "snake_case_text" ? tgError(400, PARSE_ERR) : undefined);
      clear();
      await send(text(id, "snake_case_text"));

      expect(sentTexts().some((t) => t.includes("can't parse entities"))).toBe(true);
      expect(hasInlineButtons()).toBe(false);
      expect(settings.setWelcomeMessage).not.toHaveBeenCalled();

      // The next message is a new draft, which proves the state is still AWAITING_INPUT.
      clear();
      await send(text(id, "A perfectly fine message"));
      expect(sentTexts()).toContain("Does this look good?");
      await send(press(id, "btn_save_welcome"));
      expect(settings.setWelcomeMessage).toHaveBeenCalledWith("A perfectly fine message");
    });

    it("other 400 (message is too long) gets the same handling", async () => {
      const id = admin();
      await send(text(id, "/setwelcome"));
      failWith = (m, p) => (m === "sendMessage" && p.text === "x".repeat(5000) ? tgError(400, "Bad Request: message is too long") : undefined);
      clear();
      await send(text(id, "x".repeat(5000)));

      expect(sentTexts().some((t) => t.includes("message is too long"))).toBe(true);
      expect(hasInlineButtons()).toBe(false);
      expect(settings.setWelcomeMessage).not.toHaveBeenCalled();
      await send(text(id, "short but valid"));
      expect(sentTexts()).toContain("Does this look good?");
    });

    it.each([
      ["Telegram 500", tgError(500, "Internal Server Error")],
      ["Telegram 429", tgError(429, "Too Many Requests: retry after 5")],
      ["network error (no response)", Object.assign(new Error("ECONNRESET"), { code: "ECONNRESET" })],
    ])("non-400 error (%s) is not swallowed: handleUpdate rejects and no buttons are shown", async (_n, err) => {
      const id = admin();
      jest.spyOn(console, "error").mockImplementation(() => {}); // Telegraf's default bot.catch logs
      await send(text(id, "/setwelcome"));
      failWith = (m, p) => (m === "sendMessage" && p.text === "Hello new users" ? err : undefined);
      clear();
      await expect(send(text(id, "Hello new users"))).rejects.toBe(err);
      expect(hasInlineButtons()).toBe(false);
      expect(settings.setWelcomeMessage).not.toHaveBeenCalled();
    });

    it("non-400 error goes to bot.catch when one is registered", async () => {
      const id = admin();
      const onError = jest.fn();
      bot.catch(onError);
      await send(text(id, "/setwelcome"));
      const err = tgError(500, "Internal Server Error");
      failWith = (m, p) => (m === "sendMessage" && p.text === "Hello new users" ? err : undefined);
      await send(text(id, "Hello new users"));
      expect(onError).toHaveBeenCalledWith(err, expect.anything());
    });
  });

  describe("input validation and auth", () => {
    it("text shorter than 5 characters gets 'too short' and no preview", async () => {
      const id = admin();
      await send(text(id, "/setwelcome"));
      clear();
      await send(text(id, "abcd"));
      expect(sentTexts()).toEqual([expect.stringContaining("too short")]);
    });

    it.each([
      ["a non-admin", { isAdmin: false }],
      ["an unknown user", null],
    ])("%s is rejected and no state is created", async (_n, sub) => {
      const id = newUser();
      subscribers.findByTelegramId.mockResolvedValue(sub);
      await send(text(id, "/setwelcome"));
      expect(sentTexts()).toEqual(["Only admins can use this command."]);
      clear();
      await send(text(id, "Hello new users"));
      expect(api).not.toHaveBeenCalled(); // not treated as a draft
      await send(press(id, "btn_save_welcome"));
      expect(settings.setWelcomeMessage).not.toHaveBeenCalled();
    });

    it("a failing subscriber lookup replies with an error and creates no state", async () => {
      const id = newUser();
      subscribers.findByTelegramId.mockRejectedValue(new Error("db down"));
      await send(text(id, "/setwelcome"));
      expect(sentTexts()).toEqual([expect.stringContaining("error occurred")]);
      clear();
      await send(text(id, "Hello new users"));
      expect(api).not.toHaveBeenCalled();
    });

    it("text from a user who never ran /setwelcome is ignored", async () => {
      const id = admin();
      await send(text(id, "Hello new users"));
      expect(api).not.toHaveBeenCalled();
    });

    // KNOWN BUG: the action handlers have no admin check, so anyone who can press the button
    // (e.g. in a group chat) enters the flow and can publish. Remove `.failing` once fixed.
    it.failing("a non-admin pressing btn_rewrite_welcome cannot publish a welcome message", async () => {
      const id = newUser();
      subscribers.findByTelegramId.mockResolvedValue({ isAdmin: false });
      await send(press(id, "btn_rewrite_welcome"));
      await send(text(id, "pwned welcome"));
      await send(press(id, "btn_save_welcome"));
      expect(settings.setWelcomeMessage).not.toHaveBeenCalled();
    });
  });

  describe("cancel", () => {
    it.each(["❌ Cancel", "/cancel"])("typing %s cancels and clears state", async (word) => {
      const id = admin();
      await send(text(id, "/setwelcome"));
      clear();
      await send(text(id, word));
      expect(sentTexts()).toEqual(["Operation cancelled."]);
      clear();
      await send(text(id, "Hello new users"));
      expect(api).not.toHaveBeenCalled();
    });

    it("typing Cancel while AWAITING_CONFIRMATION cancels and the draft cannot be saved", async () => {
      const id = admin();
      await startDraft(id);
      await send(text(id, "❌ Cancel"));
      await send(press(id, "btn_save_welcome"));
      expect(settings.setWelcomeMessage).not.toHaveBeenCalled();
    });

    it("btn_cancel_welcome deletes the message, confirms, answers the query and clears state", async () => {
      const id = admin();
      await startDraft(id);
      clear();
      await send(press(id, "btn_cancel_welcome"));
      expect(calls("deleteMessage")).toHaveLength(1);
      expect(sentTexts()).toEqual(["❌ Operation cancelled."]);
      expect(calls("answerCallbackQuery")).toHaveLength(1);
      await send(press(id, "btn_save_welcome"));
      expect(calls("answerCallbackQuery")[1].text).toMatch(/Session expired/);
      expect(settings.setWelcomeMessage).not.toHaveBeenCalled();
    });
  });

  describe("confirmation state", () => {
    it("typing text while AWAITING_CONFIRMATION says to use the buttons and keeps the original draft", async () => {
      const id = admin();
      await startDraft(id, "Original draft");
      clear();
      await send(text(id, "something else entirely"));
      expect(sentTexts()).toEqual([expect.stringContaining("use the buttons")]);
      await send(press(id, "btn_save_welcome"));
      expect(settings.setWelcomeMessage).toHaveBeenCalledWith("Original draft");
    });

    it("btn_save_welcome with no state answers 'Session expired' and does not save", async () => {
      const id = admin();
      await send(press(id, "btn_save_welcome"));
      expect(calls("answerCallbackQuery")[0].text).toMatch(/Session expired/);
      expect(settings.setWelcomeMessage).not.toHaveBeenCalled();
    });

    it("btn_save_welcome right after Rewrite (no draft) is 'Session expired'", async () => {
      const id = admin();
      await startDraft(id);
      await send(press(id, "btn_rewrite_welcome"));
      clear();
      await send(press(id, "btn_save_welcome"));
      expect(calls("answerCallbackQuery")[0].text).toMatch(/Session expired/);
      expect(settings.setWelcomeMessage).not.toHaveBeenCalled();
    });

    it("btn_rewrite_welcome returns to AWAITING_INPUT: the next text is a new draft and the old one is discarded", async () => {
      const id = admin();
      await startDraft(id, "First draft");
      await send(press(id, "btn_rewrite_welcome"));
      expect(calls("editMessageText")[0].text).toMatch(/try again/);
      clear();
      await send(text(id, "Second draft"));
      expect(sentTexts()).toContain("Does this look good?");
      await send(press(id, "btn_save_welcome"));
      expect(settings.setWelcomeMessage).toHaveBeenCalledTimes(1);
      expect(settings.setWelcomeMessage).toHaveBeenCalledWith("Second draft");
    });

    it("a repository failure answers 'Failed to save' and keeps the draft so Save can be retried", async () => {
      const id = admin();
      await startDraft(id);
      settings.setWelcomeMessage.mockRejectedValueOnce(new Error("db down"));
      await send(press(id, "btn_save_welcome"));
      expect(calls("answerCallbackQuery").pop().text).toMatch(/Failed to save/);
      await send(press(id, "btn_save_welcome"));
      expect(settings.setWelcomeMessage).toHaveBeenCalledTimes(2);
    });
  });

  it("two admins have independent drafts", async () => {
    const a = admin();
    const b = admin();
    await startDraft(a, "Draft from A");
    await startDraft(b, "Draft from B");
    await send(press(b, "btn_save_welcome"));
    expect(settings.setWelcomeMessage).toHaveBeenCalledWith("Draft from B");
    await send(press(a, "btn_save_welcome"));
    expect(settings.setWelcomeMessage).toHaveBeenLastCalledWith("Draft from A");
  });
});
