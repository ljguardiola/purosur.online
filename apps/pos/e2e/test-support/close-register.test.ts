import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeRegister } from "./close-register";

const BOUND_MS = 60_000;

function standInApp(close: () => Promise<void>, exited = false) {
  const launched = {
    kills: 0,
    closes: 0,
    app: {
      close: () => {
        launched.closes += 1;
        return close();
      },
      process: () => ({
        exitCode: exited ? 0 : null,
        signalCode: null,
        kill: () => {
          launched.kills += 1;
          return true;
        },
      }),
    },
  };
  return launched;
}

describe("closing a register", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("leaves the register's process alone when it closes within the bound", async () => {
    const launched = standInApp(() => Promise.resolve());

    await closeRegister(launched.app);

    expect(launched.kills).toBe(0);
  });

  it("kills the register's process, resolves and reports it when it does not close within the bound", async () => {
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    const launched = standInApp(() => new Promise<void>(() => {}));

    const closing = closeRegister(launched.app);
    await vi.advanceTimersByTimeAsync(BOUND_MS - 1);
    expect(launched.kills).toBe(0);
    await vi.advanceTimersByTimeAsync(1);

    await expect(closing).resolves.toBeUndefined();
    expect(launched.kills).toBe(1);
    expect(report).toHaveBeenCalledWith(
      "the register did not close within 60000 ms and was killed",
    );
    report.mockRestore();
  });

  it("closes nothing when the register's process has already exited", async () => {
    const launched = standInApp(() => new Promise<void>(() => {}), true);

    await closeRegister(launched.app);

    expect(launched.closes).toBe(0);
    expect(launched.kills).toBe(0);
  });
});
