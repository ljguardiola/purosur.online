import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeRegister } from "./close-register";

const BOUND_MS = 60_000;

function standInApp(close: () => Promise<void>, exited = false) {
  const launched = {
    kills: [] as (NodeJS.Signals | number | undefined)[],
    closes: 0,
    app: {
      close: () => {
        launched.closes += 1;
        return close();
      },
      process: () => ({
        exitCode: exited ? 0 : null,
        signalCode: null,
        kill: (signal?: NodeJS.Signals | number) => {
          launched.kills.push(signal);
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

    expect(launched.kills).toEqual([]);
  });

  it("kills the register's process with a signal it cannot handle, resolves and reports it when it does not close within the bound", async () => {
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    const launched = standInApp(() => new Promise<void>(() => {}));

    const closing = closeRegister(launched.app);
    await vi.advanceTimersByTimeAsync(BOUND_MS - 1);
    expect(launched.kills).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);

    await expect(closing).resolves.toBeUndefined();
    expect(launched.kills).toEqual(["SIGKILL"]);
    expect(report).toHaveBeenCalledWith(
      "the register did not close within 60000 ms and was killed",
    );
    report.mockRestore();
  });

  it("closes nothing when the register's process has already exited", async () => {
    const launched = standInApp(() => new Promise<void>(() => {}), true);

    await closeRegister(launched.app);

    expect(launched.closes).toBe(0);
    expect(launched.kills).toEqual([]);
  });
});
