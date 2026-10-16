import type { BatteryReport, BatteryStanding } from "@purosur/domain";
import { describe, expect, it, vi } from "vitest";
import { createBatteryShutdown } from "./battery-shutdown";

const PUSH_LIMIT_MS = 10_000;
const RECHECK_MS = 5_000;

type Read = BatteryStanding | "unreadable";

const REPORT_OF: Record<Read, BatteryReport | undefined> = {
  normal: { present: true, charge_percent: 80, on_battery: false, on_battery_minutes: 0 },
  low: { present: true, charge_percent: 15, on_battery: true, on_battery_minutes: 0 },
  critical: { present: true, charge_percent: 5, on_battery: true, on_battery_minutes: 0 },
  unreadable: undefined,
};

interface Timer {
  run: () => void;
  delayMs: number;
  cancelled: boolean;
}

function setup(initial: { read?: Read; openSale?: boolean } = {}) {
  const world: { read: Read; openSale: boolean } = {
    read: initial.read ?? "normal",
    openSale: initial.openSale ?? false,
  };
  const timers: Timer[] = [];
  const events: string[] = [];
  let finishPush: (outcome: Error | undefined) => void = () => undefined;
  const push = vi.fn(
    () =>
      new Promise<unknown>((resolve, reject) => {
        events.push("push started");
        finishPush = (failure) =>
          failure === undefined ? resolve({ kind: "succeeded" }) : reject(failure);
      }),
  );
  const quit = vi.fn(() => {
    events.push("quit");
  });
  const onFailure = vi.fn();
  const shutdown = createBatteryShutdown({
    report: () => REPORT_OF[world.read],
    hasOpenSale: () => world.openSale,
    push,
    schedule: (run, delayMs) => {
      const timer = { run, delayMs, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    quit,
    pushLimitMs: PUSH_LIMIT_MS,
    saleRecheckMs: RECHECK_MS,
    onFailure,
  });
  const pending = (delayMs: number) =>
    timers.filter((timer) => !timer.cancelled && timer.delayMs === delayMs);
  async function fire(delayMs: number): Promise<void> {
    const timer = pending(delayMs).at(-1);
    if (timer === undefined) {
      throw new Error(`no timer of ${delayMs} ms is pending`);
    }
    timer.cancelled = true;
    timer.run();
    await settle();
  }
  return {
    world,
    shutdown,
    push,
    quit,
    onFailure,
    events,
    pending,
    fire,
    finishPush: async (outcome?: Error) => {
      finishPush(outcome);
      await settle();
    },
    changeTo: async (read: Read) => {
      world.read = read;
      shutdown.evaluate();
      await settle();
    },
  };
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) {
    await Promise.resolve();
  }
}

describe("closing the register cleanly at a critical battery", () => {
  it("refuses nothing and does nothing while the battery does not stand as critical", async () => {
    const { shutdown, push, quit, changeTo } = setup();

    await changeTo("low");

    expect(shutdown.newSalesStoppedByBattery()).toBe(false);
    expect(push).not.toHaveBeenCalled();
    expect(quit).not.toHaveBeenCalled();
  });

  it("refuses new sales, pushes once and then quits when the battery becomes critical with no sale open", async () => {
    const { shutdown, push, quit, events, changeTo, finishPush } = setup();

    await changeTo("critical");

    expect(shutdown.newSalesStoppedByBattery()).toBe(true);
    expect(push).toHaveBeenCalledTimes(1);
    expect(quit).not.toHaveBeenCalled();

    await finishPush();

    expect(events).toEqual(["push started", "quit"]);
  });

  it("quits when the push finishes without having worked", async () => {
    const { quit, onFailure, changeTo, finishPush } = setup();
    await changeTo("critical");

    await finishPush(new Error("no internet"));

    expect(quit).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledWith(new Error("no internet"));
  });

  it("quits when the push throws before it returns anything", async () => {
    const failure = new Error("boom");
    const { push, quit, onFailure, changeTo } = setup();
    push.mockImplementationOnce(() => {
      throw failure;
    });

    await changeTo("critical");

    expect(quit).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledWith(failure);
  });

  it("quits without waiting any longer when the push does not finish within its limit", async () => {
    const { quit, pending, fire, changeTo } = setup();
    await changeTo("critical");
    expect(pending(PUSH_LIMIT_MS)).toHaveLength(1);

    await fire(PUSH_LIMIT_MS);

    expect(quit).toHaveBeenCalledTimes(1);
  });

  it("does not let the limit run out once the push finished, and quits only once", async () => {
    const { quit, pending, finishPush, changeTo } = setup();
    await changeTo("critical");

    await finishPush();

    expect(pending(PUSH_LIMIT_MS)).toHaveLength(0);
    expect(quit).toHaveBeenCalledTimes(1);
  });

  it("quits once even if the push answers after its limit ran out", async () => {
    const { quit, fire, finishPush, changeTo } = setup();
    await changeTo("critical");

    await fire(PUSH_LIMIT_MS);
    await finishPush();

    expect(quit).toHaveBeenCalledTimes(1);
  });

  it("does not start the push while a sale is open, and looks again every few seconds", async () => {
    const { shutdown, push, pending, fire, world, changeTo } = setup({ openSale: true });

    await changeTo("critical");

    expect(shutdown.newSalesStoppedByBattery()).toBe(true);
    expect(push).not.toHaveBeenCalled();
    expect(pending(RECHECK_MS)).toHaveLength(1);

    await fire(RECHECK_MS);
    expect(push).not.toHaveBeenCalled();
    expect(pending(RECHECK_MS)).toHaveLength(1);

    world.openSale = false;
    await fire(RECHECK_MS);

    expect(push).toHaveBeenCalledTimes(1);
    expect(pending(RECHECK_MS)).toHaveLength(0);
  });

  it("does not look for the open sale twice at once when told again while it waits", async () => {
    const { pending, shutdown, changeTo } = setup({ openSale: true });
    await changeTo("critical");

    shutdown.evaluate();
    shutdown.evaluate();

    expect(pending(RECHECK_MS)).toHaveLength(1);
  });

  it("starts the push as soon as it is told the sale closed, without waiting for its next look", async () => {
    const { push, world, shutdown, changeTo, pending } = setup({ openSale: true });
    await changeTo("critical");

    world.openSale = false;
    shutdown.evaluate();
    await Promise.resolve();

    expect(push).toHaveBeenCalledTimes(1);
    expect(pending(RECHECK_MS)).toHaveLength(0);
  });

  it("cancels the close and lifts the refusal when the charge recovers before the push starts", async () => {
    const { shutdown, push, quit, pending, changeTo } = setup({ openSale: true });
    await changeTo("critical");

    await changeTo("low");

    expect(shutdown.newSalesStoppedByBattery()).toBe(false);
    expect(pending(RECHECK_MS)).toHaveLength(0);
    expect(push).not.toHaveBeenCalled();
    expect(quit).not.toHaveBeenCalled();
  });

  it("closes again when the battery becomes critical after a cancelled close", async () => {
    const { push, world, changeTo } = setup({ openSale: true });
    await changeTo("critical");
    await changeTo("normal");
    world.openSale = false;

    await changeTo("critical");

    expect(push).toHaveBeenCalledTimes(1);
  });

  it("keeps closing once the push started, even if the battery stops standing as critical", async () => {
    const { shutdown, quit, changeTo, finishPush } = setup();
    await changeTo("critical");

    await changeTo("normal");
    expect(shutdown.newSalesStoppedByBattery()).toBe(true);
    await finishPush();

    expect(quit).toHaveBeenCalledTimes(1);
  });

  it("pushes only once however many times it is told the battery is critical", async () => {
    const { push, shutdown, changeTo } = setup();
    await changeTo("critical");

    shutdown.evaluate();
    shutdown.evaluate();
    await changeTo("critical");

    expect(push).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the battery cannot be read before it ever stood as critical", async () => {
    const { shutdown, push, changeTo } = setup();

    await changeTo("unreadable");

    expect(shutdown.newSalesStoppedByBattery()).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps refusing new sales and waiting for the open sale when a read fails, then closes once the sale does", async () => {
    const { shutdown, push, pending, fire, world, changeTo } = setup({ openSale: true });
    await changeTo("critical");

    await changeTo("unreadable");

    expect(shutdown.newSalesStoppedByBattery()).toBe(true);
    expect(pending(RECHECK_MS)).toHaveLength(1);

    world.openSale = false;
    await fire(RECHECK_MS);

    expect(push).toHaveBeenCalledTimes(1);
  });

  it("lifts the refusal when a read after a failed one finds the charge recovered", async () => {
    const { shutdown, push, changeTo } = setup({ openSale: true });
    await changeTo("critical");
    await changeTo("unreadable");

    await changeTo("low");

    expect(shutdown.newSalesStoppedByBattery()).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });
});
