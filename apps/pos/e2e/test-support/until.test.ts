import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { untilLogged } from "./until";

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
