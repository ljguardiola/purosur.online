import type { DiscoverPaidOrdersWithoutSaleOutcome } from "@purosur/domain/payments/use-cases";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { restorationOf } from "../register/test-support/restoration-of";
import { uuidV7Ids } from "../register/uuid-v7-ids";
import { printingEachCompletedSale } from "../sales/printing-completed-sales";
import { createSignedInPerson } from "../sessions/signed-in-person";
import {
  createPaidOrderDiscovery,
  createPaidOrderDiscoveryWiring,
} from "./paid-order-discovery-wiring";
import {
  CHARGE_CHAIN_KEY,
  CHARGE_NOW,
  chargeRequestDeps,
  FakeMercadoPagoOrders,
  openSaleOfTwoYerbas,
  seedChargeRegister,
} from "./test-support/mercado-pago-charge-requests";

const CHECKED: DiscoverPaidOrdersWithoutSaleOutcome = {
  kind: "checked",
  applied: 0,
  duplicateCharges: 0,
  withoutSale: 0,
  failed: 0,
  completedSaleIds: [],
};
const DEFERRED: DiscoverPaidOrdersWithoutSaleOutcome = { kind: "deferred" };
const NOT_PRINTING = { afterEachCompletedSale: <T>(follow: T) => follow };

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
    printing: NOT_PRINTING,
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
      printing: NOT_PRINTING,
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
      printing: NOT_PRINTING,
      reportFailure: () => {},
    });
    const first = discovery.discoverAtStartup();
    underWay.reject(new Error("boom"));
    await first;

    await discovery.discoverAtStartup();

    expect(discovery.state()).toBe("checked");
  });
});

describe("the sales a discovery completes", () => {
  function printingSubject(outcomes: DiscoverPaidOrdersWithoutSaleOutcome[]) {
    const events: string[] = [];
    const discovery = createPaidOrderDiscovery({
      discover: async () => outcomes.shift() ?? CHECKED,
      printing: {
        afterEachCompletedSale: (follow) =>
          follow &&
          printingEachCompletedSale(
            {
              beforePrinting: async (saleId) => {
                events.push(`authorize ${saleId}`);
              },
              print: async (saleId) => {
                events.push(`print ${saleId}`);
              },
              syncNow: () => {
                events.push("sync");
              },
              onFailure: () => {},
            },
            follow,
          ),
      },
      reportFailure: () => {},
    });
    return { discovery, events };
  }

  it("authorizes, prints and then syncs a sale the startup discovery completes", async () => {
    const { discovery, events } = printingSubject([
      { ...CHECKED, applied: 1, completedSaleIds: ["sale-1"] },
    ]);

    await discovery.discoverAtStartup();

    await vi.waitFor(() => expect(events).toEqual(["authorize sale-1", "print sale-1", "sync"]));
  });

  it("authorizes, prints and syncs a sale a discovery after a sync completes", async () => {
    const { discovery, events } = printingSubject([
      DEFERRED,
      { ...CHECKED, applied: 1, completedSaleIds: ["sale-2"] },
    ]);
    await discovery.discoverAtStartup();

    discovery.afterEachSync();

    await vi.waitFor(() => expect(events).toEqual(["authorize sale-2", "print sale-2", "sync"]));
  });

  it("prints nothing when the discovery completed no sale", async () => {
    const { discovery, events } = printingSubject([{ ...CHECKED, applied: 1 }]);

    await discovery.discoverAtStartup();

    expect(events).toEqual([]);
  });
});

describe("discovering the paid orders while the register is being restored", () => {
  const PAYMENT_ID = "0b6f2c1e-4a7d-4c1e-9f2a-5d3e8b7a6c41";
  let database: LocalDatabase;
  let cloudCalls: number;

  beforeEach(() => {
    database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
    seedChargeRegister(database);
    cloudCalls = 0;
  });

  afterEach(() => {
    database.close();
  });

  async function discoveryOverAnApprovedOrder() {
    const signedInPerson = createSignedInPerson();
    signedInPerson.set("u1");
    const saleId = await openSaleOfTwoYerbas({ database, signedInPerson }, uuidV7Ids);
    const failures: unknown[] = [];
    const discovery = createPaidOrderDiscoveryWiring({
      database,
      gate: chargeRequestDeps(
        { database, signedInPerson },
        new FakeMercadoPagoOrders(() => database),
      ).gate,
      printing: NOT_PRINTING,
      cloudClient: {
        cloudUrl: "https://cloud.example",
        fetch: async () => {
          cloudCalls += 1;
          return new Response(
            JSON.stringify({
              orders: [
                {
                  payment_transaction_id: PAYMENT_ID,
                  sale_id: saleId,
                  method: "QR",
                  provider: "MERCADOPAGO_QR",
                  amount: 3000,
                  created_at: new Date(CHARGE_NOW.getTime() - 60_000).toISOString(),
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        },
        sleep: async () => {},
      },
      readDeviceToken: async () => "prefix.secret",
      readOutboxChainKey: async () => CHARGE_CHAIN_KEY,
      now: () => CHARGE_NOW,
      ids: uuidV7Ids,
      restoration: restorationOf(database),
      reportFailure: (_activity, error) => failures.push(error),
    });
    return { discovery, saleId, failures };
  }

  const markStale = () =>
    database
      .prepare("UPDATE sync_state SET stale_sequence_detected_at = '2026-10-09T08:00:00.000Z'")
      .run();
  const heldPayments = () =>
    database.prepare("SELECT id FROM payment_transactions WHERE id = ?").all(PAYMENT_ID);
  const unmatchedOrders = () => database.prepare("SELECT * FROM paid_orders_without_sale").all();
  const saleState = (saleId: string) =>
    database.prepare("SELECT state FROM sales WHERE id = ?").get(saleId);

  it("settles nothing and marks no order as handled or lost while the restoration is in progress", async () => {
    const { discovery, saleId, failures } = await discoveryOverAnApprovedOrder();
    markStale();

    await discovery.discoverAtStartup();

    expect(discovery.state()).toBe("deferred");
    expect(failures).toEqual([]);
    expect(cloudCalls).toBe(0);
    expect(heldPayments()).toEqual([]);
    expect(unmatchedOrders()).toEqual([]);
    expect(saleState(saleId)).toEqual({ state: "OPEN" });
  });

  it("settles the order on the synchronization after the restoration completes", async () => {
    const { discovery, saleId, failures } = await discoveryOverAnApprovedOrder();
    markStale();
    await discovery.discoverAtStartup();
    database.prepare("UPDATE sync_state SET stale_sequence_detected_at = NULL").run();

    discovery.afterEachSync();
    await discovery.discoverAtStartup();

    expect(discovery.state()).toBe("checked");
    expect(failures).toEqual([]);
    expect(saleState(saleId)).toEqual({ state: "COMPLETED" });
    expect(
      database.prepare("SELECT state FROM payment_transactions WHERE id = ?").get(PAYMENT_ID),
    ).toEqual({
      state: "APPROVED",
    });
  });
});
