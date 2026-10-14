import type { DiscoverPaidOrdersWithoutSaleOutcome } from "@purosur/domain/payments/use-cases";
import { describe, expect, it } from "vitest";
import { createPaidOrderDiscovery } from "./paid-order-discovery-wiring";

const CHECKED: DiscoverPaidOrdersWithoutSaleOutcome = {
  kind: "checked",
  applied: 0,
  duplicateCharges: 0,
  withoutSale: 0,
  failed: 0,
};
const DEFERRED: DiscoverPaidOrdersWithoutSaleOutcome = { kind: "deferred" };

function deferredRun() {
  let resolve: (outcome: DiscoverPaidOrdersWithoutSaleOutcome) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<DiscoverPaidOrdersWithoutSaleOutcome>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function subject(outcomes: (DiscoverPaidOrdersWithoutSaleOutcome | Error)[]) {
  const failures: [string, unknown][] = [];
  let runs = 0;
  const discovery = createPaidOrderDiscovery({
    discover: async () => {
      runs += 1;
      const outcome = outcomes.shift() ?? CHECKED;
      if (outcome instanceof Error) {
        throw outcome;
      }
      return outcome;
    },
    reportFailure: (activity, error) => {
      failures.push([activity, error]);
    },
  });
  return { discovery, failures, runs: () => runs };
}

describe("discovering the paid orders of a run", () => {
  it("has not tried before startup recovery asks", () => {
    expect(subject([]).discovery.state()).toBe("pending");
  });

  it("is checked once the cloud answered the orders", async () => {
    const { discovery } = subject([CHECKED]);

    await discovery.discoverAtStartup();

    expect(discovery.state()).toBe("checked");
  });

  it("is deferred when the cloud could not be reached", async () => {
    const { discovery } = subject([DEFERRED]);

    await discovery.discoverAtStartup();

    expect(discovery.state()).toBe("deferred");
  });

  it("is deferred, reporting it, when an order could not be handled", async () => {
    const { discovery, failures } = subject([{ ...CHECKED, failed: 2 }]);

    await discovery.discoverAtStartup();

    expect(discovery.state()).toBe("deferred");
    expect(failures).toHaveLength(1);
    expect(failures[0]?.[0]).toBe("handling 2 paid orders found in the cloud");
  });

  it("is deferred, reporting the failure without throwing, when discovering fails", async () => {
    const error = new Error("database is locked");
    const { discovery, failures } = subject([error]);

    await expect(discovery.discoverAtStartup()).resolves.toBeUndefined();

    expect(discovery.state()).toBe("deferred");
    expect(failures).toEqual([["discovering the paid orders without a sale", error]]);
  });
});

describe("retrying on each synchronization", () => {
  it("tries again while the run has not reached the cloud", async () => {
    const { discovery, runs } = subject([DEFERRED, CHECKED]);
    await discovery.discoverAtStartup();

    discovery.afterEachSync();
    await discovery.discoverAtStartup();

    expect(runs()).toBe(2);
    expect(discovery.state()).toBe("checked");
  });

  it("tries without startup having asked, as the first try of the run", async () => {
    const { discovery, runs } = subject([CHECKED]);

    discovery.afterEachSync();
    await Promise.resolve();
    await Promise.resolve();

    expect(runs()).toBe(1);
    expect(discovery.state()).toBe("checked");
  });

  it("does not ask the cloud again once the run has checked", async () => {
    const { discovery, runs } = subject([CHECKED]);
    await discovery.discoverAtStartup();

    discovery.afterEachSync();
    await discovery.discoverAtStartup();

    expect(runs()).toBe(1);
  });
});

describe("never discovering twice at once", () => {
  it("joins a try that is under way instead of starting another", async () => {
    const underWay = deferredRun();
    let runs = 0;
    const discovery = createPaidOrderDiscovery({
      discover: () => {
        runs += 1;
        return underWay.promise;
      },
      reportFailure: () => {},
    });

    const first = discovery.discoverAtStartup();
    discovery.afterEachSync();
    const second = discovery.discoverAtStartup();
    underWay.resolve(CHECKED);
    await Promise.all([first, second]);

    expect(runs).toBe(1);
    expect(discovery.state()).toBe("checked");
  });

  it("can try again after a try that failed", async () => {
    const underWay = deferredRun();
    const outcomes = [underWay.promise, Promise.resolve(CHECKED)];
    const discovery = createPaidOrderDiscovery({
      discover: () => outcomes.shift() ?? Promise.resolve(CHECKED),
      reportFailure: () => {},
    });
    const first = discovery.discoverAtStartup();
    underWay.reject(new Error("boom"));
    await first;

    await discovery.discoverAtStartup();

    expect(discovery.state()).toBe("checked");
  });
});
