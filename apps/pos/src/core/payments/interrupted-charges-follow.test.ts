import { describe, expect, it } from "vitest";
import { createInterruptedChargesFollow } from "./interrupted-charges-follow";

const RUN_STARTED_AT = new Date("2026-10-13T12:00:00.000Z");

type Followed = { failures: { paymentTransactionId: string; error: unknown }[] };

function deferred() {
  let resolve: (followed: Followed) => void = () => {};
  const promise = new Promise<Followed>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function subject(follow: ((runStartedAt: Date) => Promise<Followed>) | undefined) {
  const failures: [string, unknown][] = [];
  const following = createInterruptedChargesFollow({
    follow,
    runStartedAt: RUN_STARTED_AT,
    reportFailure: (activity, error) => {
      failures.push([activity, error]);
    },
  });
  return { failures, following };
}

describe("following the charges a stopped register left pending", () => {
  it("follows the charges recorded before this run started", async () => {
    const asked: Date[] = [];
    const { following } = subject(async (runStartedAt) => {
      asked.push(runStartedAt);
      return { failures: [] };
    });

    await following.followNow();

    expect(asked).toEqual([RUN_STARTED_AT]);
  });

  it("joins a follow still under way instead of starting another, and follows again once it ended", async () => {
    const first = deferred();
    let follows = 0;
    const { following } = subject(() => {
      follows += 1;
      return follows === 1 ? first.promise : Promise.resolve({ failures: [] });
    });

    const under = following.followNow();
    const joined = following.followNow();
    expect(follows).toBe(1);
    first.resolve({ failures: [] });
    await Promise.all([under, joined]);
    await following.followNow();

    expect(follows).toBe(2);
  });

  it("reports each charge that could not be followed", async () => {
    const first = new Error("first");
    const second = new Error("second");
    const { failures, following } = subject(async () => ({
      failures: [
        { paymentTransactionId: "qr-1", error: first },
        { paymentTransactionId: "qr-2", error: second },
      ],
    }));

    await following.followNow();

    expect(failures).toEqual([
      ["following the interrupted Mercado Pago charge qr-1", first],
      ["following the interrupted Mercado Pago charge qr-2", second],
    ]);
  });

  it("reports a follow that failed as a whole and follows again the next time", async () => {
    const broken = new Error("the charges could not be followed");
    let follows = 0;
    const { failures, following } = subject(async () => {
      follows += 1;
      if (follows === 1) {
        throw broken;
      }
      return { failures: [] };
    });

    await following.followNow();
    await following.followNow();

    expect(failures).toEqual([["following the interrupted Mercado Pago charges", broken]]);
    expect(follows).toBe(2);
  });

  it("does nothing when there is no way to follow charges", async () => {
    const { failures, following } = subject(undefined);

    await following.followNow();

    expect(failures).toEqual([]);
  });
});
