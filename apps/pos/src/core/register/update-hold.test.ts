import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUpdateHold, gateRendererRequest } from "./update-hold";

interface Request {
  type: string;
  request_id?: string;
}

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function setup(options: { openSale?: () => boolean; limitMs?: number } = {}) {
  const hold = createUpdateHold({
    hasOpenSale: options.openSale ?? (() => false),
    schedule: (run, delayMs) => {
      const timer = setTimeout(run, delayMs);
      return () => clearTimeout(timer);
    },
    limitMs: options.limitMs ?? 30_000,
  });
  const handled: Request[] = [];
  const refused: string[] = [];
  const gate = gateRendererRequest<Request>(
    hold,
    async (message) => {
      handled.push(message);
    },
    (requestId) => {
      refused.push(requestId);
    },
  );
  const gateRunning = (run: () => Promise<void>) =>
    gateRendererRequest<Request>(hold, run, (requestId) => {
      refused.push(requestId);
    });
  return { hold, gate, gateRunning, handled, refused };
}

const request = (id: string): Request => ({ type: "weigh-product", request_id: id });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createUpdateHold", () => {
  it("answers not safe and keeps taking requests while a sale is open", async () => {
    const { hold, gate, handled } = setup({ openSale: () => true });

    expect(await hold.answerSafeMomentRequest("r-1")).toEqual({
      type: "update-safe-moment",
      request_id: "r-1",
      safe: false,
    });
    gate(request("q-1"));

    expect(handled).toEqual([request("q-1")]);
  });

  it("answers safe and refuses requests when no sale is open", async () => {
    const { hold, gate, handled, refused } = setup();

    expect(await hold.answerSafeMomentRequest("r-2")).toEqual({
      type: "update-safe-moment",
      request_id: "r-2",
      safe: true,
    });
    gate(request("q-1"));

    expect(handled).toEqual([]);
    expect(refused).toEqual(["q-1"]);
  });

  it("releases itself once the limit passes", async () => {
    const { hold, gate, handled } = setup({ limitMs: 12_000 });
    await hold.answerSafeMomentRequest("r-1");

    vi.advanceTimersByTime(11_999);
    gate(request("q-1"));
    vi.advanceTimersByTime(1);
    gate(request("q-2"));

    expect(handled).toEqual([request("q-2")]);
  });

  it("releases when asked to and cancels the pending limit", async () => {
    const { hold, gate, handled } = setup();
    await hold.answerSafeMomentRequest("r-1");

    hold.release();
    gate(request("q-1"));

    expect(handled).toEqual([request("q-1")]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("answers safe again while held and restarts the limit", async () => {
    const { hold, gate, handled } = setup({ limitMs: 12_000 });
    await hold.answerSafeMomentRequest("r-1");
    vi.advanceTimersByTime(6_000);

    expect((await hold.answerSafeMomentRequest("r-2")).safe).toBe(true);
    vi.advanceTimersByTime(11_999);
    gate(request("q-1"));
    vi.advanceTimersByTime(1);
    gate(request("q-2"));

    expect(handled).toEqual([request("q-2")]);
  });

  it("ignores a release when nothing is held", () => {
    const { hold, gate, handled } = setup();

    hold.release();
    gate(request("q-1"));

    expect(handled).toEqual([request("q-1")]);
  });

  it("answers not safe and refuses nothing while a request is running and a sale is open", async () => {
    const { hold, gate, gateRunning, handled, refused } = setup({ openSale: () => true });
    const scale = deferred();
    gateRunning(() => scale.promise)(request("q-1"));

    const answer = hold.answerSafeMomentRequest("r-1");
    gate(request("q-2"));
    scale.resolve();

    expect((await answer).safe).toBe(false);
    expect(handled).toEqual([request("q-2")]);
    expect(refused).toEqual([]);
  });

  it("answers not safe and refuses nothing while a request is running", async () => {
    const { hold, gate, gateRunning, handled, refused } = setup();
    const scale = deferred();
    gateRunning(() => scale.promise)(request("q-1"));

    const answer = hold.answerSafeMomentRequest("r-1");
    gate(request("q-2"));

    expect((await answer).safe).toBe(false);
    expect(handled).toEqual([request("q-2")]);
    expect(refused).toEqual([]);
  });

  it("answers safe once the running request has settled", async () => {
    const { hold, gateRunning } = setup();
    const scale = deferred();
    gateRunning(() => scale.promise)(request("q-1"));

    scale.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect((await hold.answerSafeMomentRequest("r-1")).safe).toBe(true);
  });

  it("answers not safe while a request that opens a sale is running and sees the sale once it settles", async () => {
    let openSale = false;
    const { hold, gateRunning } = setup({ openSale: () => openSale });
    const scale = deferred();
    gateRunning(async () => {
      await scale.promise;
      openSale = true;
    })(request("q-1"));

    expect((await hold.answerSafeMomentRequest("r-1")).safe).toBe(false);
    scale.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect((await hold.answerSafeMomentRequest("r-2")).safe).toBe(false);
  });

  it("takes requests again when the open sale can not be read", async () => {
    const { hold, gate, handled } = setup({
      openSale: () => {
        throw new Error("database is locked");
      },
    });

    await expect(hold.answerSafeMomentRequest("r-1")).rejects.toThrow("database is locked");
    gate(request("q-1"));

    expect(handled).toEqual([request("q-1")]);
  });
});

describe("gateRendererRequest", () => {
  it("passes a request on while nothing is held", () => {
    const { gate, handled } = setup();

    gate(request("q-1"));

    expect(handled).toEqual([request("q-1")]);
  });

  it("refuses a request while held and passes again after the release", async () => {
    const { hold, gate, handled, refused } = setup();
    await hold.answerSafeMomentRequest("r-1");

    gate(request("q-1"));
    expect(handled).toEqual([]);
    expect(refused).toEqual(["q-1"]);

    hold.release();
    gate(request("q-2"));
    expect(handled).toEqual([request("q-2")]);
  });

  it("drops a held message that expects no answer", async () => {
    const { hold, gate, handled, refused } = setup();
    await hold.answerSafeMomentRequest("r-1");

    gate({ type: "ping" });

    expect(handled).toEqual([]);
    expect(refused).toEqual([]);
  });
});
