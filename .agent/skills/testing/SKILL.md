---
name: testing
description: Testing conventions for this Telegraf + MySQL bot (Jest, ts-jest). Use when writing or reviewing tests.
user-invocable: false
---

# Testing Strategy

## Setup

- Jest with `ts-jest` (`jest.config.js`, roots: `src/`). Run: `npm test`, or `npx jest <path>` for one file.
- Tests are co-located: `src/<area>/<Module>.test.ts`.
- No Supertest, NestJS or Vitest here. Do not add test dependencies.
- No real MySQL, Telegram or network calls.

## Always mock

The logger writes to `logs/`, and `config.ts` throws when `TELEGRAM_TOKEN` is missing.
Paths are relative to the test file.

```typescript
const mockLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
jest.mock("../../infrastructure/logger", () => ({ GetLogger: () => mockLogger }));

// Needed when the code under test imports CONFIG. List only the keys it reads.
jest.mock("../../config/config", () => ({
  CONFIG: { TELEGRAM: { CHUNK_SIZE: 25, PAGE_SIZE: 500 }, DRY_RUN: false },
}));
```

## Dependencies

Repositories, messenger and worker are injected: pass plain objects of `jest.fn()` with `as any`.
Use `jest.mock` only for module-level imports (logger, config, `mysql2/promise`).

- **Repositories** (`src/repositories/`): pass a fake pool, assert the result and the SQL parameters.
  Stub whichever pool method the code calls.
  ```typescript
  const execute = jest.fn().mockResolvedValue([[{ setting_value: "5" }]]);
  const repo = new SettingsRepository({ execute } as any);
  ```
- **Subscriber streams**: `getSubscribersStream` is consumed with `for await`, so an async generator is enough.
- **BroadcastWorker**: the constructor starts async work; let it settle with
  `await new Promise(setImmediate)`. It also pauses 2s every `CHUNK_SIZE` messages and uses a real
  Bottleneck limiter, so keep subscriber lists small or control time with fake timers.

## Commands and buttons

Drive a real `Telegraf` instance with fake updates through `bot.handleUpdate`, and stub the API.
Copy the helpers from `src/commands/setWelcome/setWelcome.test.ts` (text messages, commands, button
presses, Telegram errors).

```typescript
bot = new Telegraf("123:FAKE");
bot.botInfo = { id: 1, is_bot: true, first_name: "bot", username: "bot" } as any;
// Telegraf builds a new Telegram instance per update, so stub the prototype.
api = jest.spyOn(Telegram.prototype, "callApi").mockResolvedValue({ message_id: 1 } as any);
```

- Module-level state (e.g. `adminStates`) survives between tests: use a fresh user id per test.
- Restore spies in `afterEach`.

## What to cover

Happy path first, then the edge cases that apply to the change:

- **Authorization**: non-admin, revoked admin, unknown user, for commands *and* buttons.
- **Repeats**: double click, old button, command sent while a flow or broadcast is already running.
- **Telegram errors**: 403 (blocked), 400 (parse), 429, network failure.
- **DB errors**: a rejected query; no unhandled rejection, state not left stuck.
- **Boundaries**: zero rows, exactly one page / chunk, one more than that, min and max input.

## Rules

- Assert observable behaviour: API calls, repository calls, return values. Include what must *not* happen.
- Name tests as plain sentences describing the behaviour:
  `"a non-admin pressing Confirm cannot start a broadcast"`.
- Group with `describe`; use `it.each` for input tables.
- Add to the existing test file for a module when there is one.
