import { describe, expect, it, vi } from "vitest";
import { createRegisterConditionWatch } from "./register-condition-watch";

const INTERVAL_MS = 30_000;

function setup(observe: () => void = () => undefined) {
  const pending: { run: () => void; delayMs: number }[] = [];
  const onFailure = vi.fn();
  const observed = vi.fn(observe);
  const watch = createRegisterConditionWatch({
    observe: observed,
    intervalMs: INTERVAL_MS,
    scheduleNext: (run, delayMs) => {
      pending.push({ run, delayMs });
      return () => undefined;
    },
    onFailure,
  });
  return { watch, pending, observed, onFailure };
}

describe("the register condition watch", () => {
  it("observes the conditions as soon as it starts and schedules the next observation", () => {
    const { watch, pending, observed } = setup();

    watch.start();

    expect(observed).toHaveBeenCalledTimes(1);
    expect(pending.map((entry) => entry.delayMs)).toEqual([INTERVAL_MS]);
  });

  it("observes again every interval", () => {
    const { watch, pending, observed } = setup();
    watch.start();

    pending[0]?.run();
    pending[1]?.run();

    expect(observed).toHaveBeenCalledTimes(3);
    expect(pending.map((entry) => entry.delayMs)).toEqual([INTERVAL_MS, INTERVAL_MS, INTERVAL_MS]);
  });

  it("reports a failed observation and keeps observing", () => {
    const failure = new Error("database is locked");
    let failing = true;
    const { watch, pending, observed, onFailure } = setup(() => {
      if (failing) {
        throw failure;
      }
    });

    watch.start();
    failing = false;
    pending[0]?.run();

    expect(onFailure).toHaveBeenCalledExactlyOnceWith(failure);
    expect(observed).toHaveBeenCalledTimes(2);
    expect(pending).toHaveLength(2);
  });
});
