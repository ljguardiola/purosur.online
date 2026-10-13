import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { until, untilLogged, within } from "./until";

const BOUND_MS = 60_000;

class StandInProcess extends EventEmitter {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;

  exit(code: number): void {
    this.exitCode = code;
    this.emit("close", code, null);
  }
}

function standInApp(): { readonly app: { process(): StandInProcess }; readonly logs: string[] } {
  const child = new StandInProcess();
  return { app: { process: () => child }, logs: [] };
}

describe("waiting for the register to log a line", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fails once the bound passes, naming the line and showing what the register logged", async () => {
    const launched = standInApp();
    launched.logs.push("main: window created\n", "core: forked\n");

    const waiting = untilLogged(launched, "core: serial devices listed", { withinMs: BOUND_MS });
    const failure = expect(waiting).rejects.toThrow(
      /core: serial devices listed[\s\S]*main: window created\ncore: forked/,
    );
    await vi.advanceTimersByTimeAsync(BOUND_MS);

    await failure;
  });

  it("keeps waiting until the bound passes", async () => {
    const launched = standInApp();
    let settled = false;

    void untilLogged(launched, "core: serial devices listed", { withinMs: BOUND_MS }).then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await vi.advanceTimersByTimeAsync(BOUND_MS - 1);

    expect(settled).toBe(false);
  });

  it("ends as soon as the register logs the line within the bound", async () => {
    const launched = standInApp();

    const waiting = untilLogged(launched, "core: serial devices listed", { withinMs: BOUND_MS });
    launched.logs.push("core: serial devices listed\n");
    await vi.advanceTimersByTimeAsync(BOUND_MS / 2);

    await expect(waiting).resolves.toBeUndefined();
  });

  it("fails when the register exits first, showing what it logged", async () => {
    const launched = standInApp();
    launched.logs.push("main: core failed to start\n");

    const waiting = untilLogged(launched, "core: serial devices listed", { withinMs: BOUND_MS });
    const failure = expect(waiting).rejects.toThrow(/exited[\s\S]*main: core failed to start/);
    launched.app.process().exit(1);
    await vi.advanceTimersByTimeAsync(BOUND_MS / 2);

    await failure;
  });
});

describe("waiting for a condition", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fails once the bound passes, naming what it waited for and the bound", async () => {
    const waiting = until(() => false, { withinMs: BOUND_MS, waitingFor: "the core to restart" });
    const failure = expect(waiting).rejects.toThrow(
      "timed out after 60000 ms waiting for the core to restart",
    );
    await vi.advanceTimersByTimeAsync(BOUND_MS);

    await failure;
  });

  it("keeps waiting until the bound passes", async () => {
    let settled = false;

    void until(() => false, { withinMs: BOUND_MS, waitingFor: "the core to restart" }).then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await vi.advanceTimersByTimeAsync(BOUND_MS - 1);

    expect(settled).toBe(false);
  });

  it("ends as soon as the condition holds within the bound", async () => {
    let holds = false;

    const waiting = until(() => holds, { withinMs: BOUND_MS, waitingFor: "the core to restart" });
    await vi.advanceTimersByTimeAsync(500);
    holds = true;
    await vi.advanceTimersByTimeAsync(500);

    await expect(waiting).resolves.toBeUndefined();
  });

  it("fails at the bound when checking the condition never ends", async () => {
    const waiting = until(() => new Promise<boolean>(() => {}), {
      withinMs: BOUND_MS,
      waitingFor: "the register to list its processes",
    });
    const failure = expect(waiting).rejects.toThrow("the register to list its processes");
    await vi.advanceTimersByTimeAsync(BOUND_MS);

    await failure;
  });

  it("fails with the condition's own error when checking it throws", async () => {
    const waiting = until(() => Promise.reject(new Error("the app is gone")), {
      withinMs: BOUND_MS,
      waitingFor: "the core to restart",
    });

    await expect(waiting).rejects.toThrow("the app is gone");
  });
});

describe("waiting for a promise", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fails once the bound passes, naming what it waited for and the bound", async () => {
    const waiting = within(new Promise<void>(() => {}), {
      withinMs: BOUND_MS,
      waitingFor: "the register to exit",
    });
    const failure = expect(waiting).rejects.toThrow(
      "timed out after 60000 ms waiting for the register to exit",
    );
    await vi.advanceTimersByTimeAsync(BOUND_MS);

    await failure;
  });

  it("keeps waiting until the bound passes", async () => {
    let settled = false;

    void within(new Promise<void>(() => {}), {
      withinMs: BOUND_MS,
      waitingFor: "the register to exit",
    }).then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await vi.advanceTimersByTimeAsync(BOUND_MS - 1);

    expect(settled).toBe(false);
  });

  it("resolves with the promise's value when it settles within the bound", async () => {
    const waiting = within(Promise.resolve(42), {
      withinMs: BOUND_MS,
      waitingFor: "the register to exit",
    });

    await expect(waiting).resolves.toBe(42);
  });

  it("rejects with the promise's own error when it fails within the bound", async () => {
    const waiting = within(Promise.reject(new Error("spawn failed")), {
      withinMs: BOUND_MS,
      waitingFor: "the register to exit",
    });

    await expect(waiting).rejects.toThrow("spawn failed");
  });
});
