import { describe, expect, it, vi } from "vitest";
import { createUpdateHold, gateRendererRequest } from "./update-hold";

function setup(options: { openSale?: boolean | Promise<boolean>; limitMs?: number } = {}) {
  const scheduled: { run: () => void; delayMs: number; cancelled: boolean }[] = [];
  const hold = createUpdateHold({
    hasOpenSale: () => options.openSale ?? false,
    schedule: (run, delayMs) => {
      const entry = { run, delayMs, cancelled: false };
      scheduled.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
    limitMs: options.limitMs ?? 30_000,
  });
  return { hold, scheduled };
}

describe("createUpdateHold", () => {
  it("answers not safe and stays free while a sale is open", async () => {
    const { hold, scheduled } = setup({ openSale: true });

    expect(await hold.answerSafeMomentRequest("r-1")).toEqual({
      type: "update-safe-moment",
      request_id: "r-1",
      safe: false,
    });
    expect(hold.isHeld()).toBe(false);
    expect(scheduled).toEqual([]);
  });

  it("waits for an asynchronous open-sale answer", async () => {
    const { hold } = setup({ openSale: Promise.resolve(true) });

    expect((await hold.answerSafeMomentRequest("r-1")).safe).toBe(false);
  });

  it("answers safe and holds when no sale is open", async () => {
    const { hold } = setup();

    expect(await hold.answerSafeMomentRequest("r-2")).toEqual({
      type: "update-safe-moment",
      request_id: "r-2",
      safe: true,
    });
    expect(hold.isHeld()).toBe(true);
  });

  it("releases itself once the limit passes", async () => {
    const { hold, scheduled } = setup({ limitMs: 12_000 });
    await hold.answerSafeMomentRequest("r-1");

    expect(scheduled.map(({ delayMs }) => delayMs)).toEqual([12_000]);
    scheduled[0]?.run();

    expect(hold.isHeld()).toBe(false);
  });

  it("releases when asked to and cancels the pending limit", async () => {
    const { hold, scheduled } = setup();
    await hold.answerSafeMomentRequest("r-1");

    hold.release();

    expect(hold.isHeld()).toBe(false);
    expect(scheduled[0]?.cancelled).toBe(true);
  });

  it("answers safe again while held and restarts the limit", async () => {
    const { hold, scheduled } = setup();
    await hold.answerSafeMomentRequest("r-1");

    expect((await hold.answerSafeMomentRequest("r-2")).safe).toBe(true);

    expect(scheduled[0]?.cancelled).toBe(true);
    expect(scheduled[1]?.cancelled).toBe(false);
    scheduled[0]?.run();
    expect(hold.isHeld()).toBe(true);
    scheduled[1]?.run();
    expect(hold.isHeld()).toBe(false);
  });

  it("ignores a release when nothing is held", () => {
    const { hold } = setup();

    hold.release();

    expect(hold.isHeld()).toBe(false);
  });
});

describe("gateRendererRequest", () => {
  it("passes a request on while nothing is held", () => {
    const { hold } = setup();
    const handle = vi.fn();

    gateRendererRequest(hold, handle)({ id: 1 });

    expect(handle).toHaveBeenCalledWith({ id: 1 });
  });

  it("refuses a request while held and passes again after the release", async () => {
    const { hold } = setup();
    const handle = vi.fn();
    const gated = gateRendererRequest(hold, handle);
    await hold.answerSafeMomentRequest("r-1");

    gated({ id: 1 });
    expect(handle).not.toHaveBeenCalled();

    hold.release();
    gated({ id: 2 });
    expect(handle).toHaveBeenCalledWith({ id: 2 });
  });
});
