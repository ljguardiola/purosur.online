import { describe, expect, it } from "vitest";
import { createInterruptedChargesFollow } from "./interrupted-charges-follow";

const LEFT_PENDING = [{ paymentTransactionId: "qr-1", actorId: "u1" }];

type LeftPending = typeof LEFT_PENDING;

type Followed = { failures: { paymentTransactionId: string; error: unknown }[] };

function deferred() {
  let resolve: (followed: Followed) => void = () => {};
  const promise = new Promise<Followed>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function subject(follow: ((interrupted: LeftPending) => Promise<Followed>) | undefined) {
  const failures: [string, unknown][] = [];
  const following = createInterruptedChargesFollow({
    follow,
    interrupted: LEFT_PENDING,
    reportFailure: (activity, error) => {
      failures.push([activity, error]);
    },
  });
  return { failures, following };
}

describe("following the charges a stopped register left pending", () => {
  it("follows, every time, the charges it was handed as left pending", async () => {
    const asked: LeftPending[] = [];
    const { following } = subject(async (interrupted) => {
      asked.push(interrupted);
      return { failures: [] };
    });

    await following.followNow();
    await following.followNow();

    expect(asked).toEqual([LEFT_PENDING, LEFT_PENDING]);
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
