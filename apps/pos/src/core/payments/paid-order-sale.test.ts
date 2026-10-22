import {
  type ApprovedOrderOfRegister,
  type DiscoverPaidOrdersWithoutSaleOutcome,
  discoverPaidOrdersWithoutSale,
} from "@purosur/domain/payments/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { restorationOf } from "../register/test-support/restoration-of";
import { uuidV7Ids } from "../register/uuid-v7-ids";
import { createSignedInPerson } from "../sessions/signed-in-person";
import { paidOrderSale } from "./paid-order-sale";
import { SqliteLocalPaidOrders } from "./sqlite-local-paid-orders";
import {
  CHARGE_CHAIN_KEY,
  CHARGE_NOW,
  openSaleOfTwoYerbas,
  seedChargeRegister,
} from "./test-support/mercado-pago-charge-requests";

const PAYMENT_ID = "0b6f2c1e-4a7d-4c1e-9f2a-5d3e8b7a6c41";

let database: LocalDatabase;

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  seedChargeRegister(database);
});

afterEach(() => {
  database.close();
});

async function saleHoldingPaidOrder(amount = 3000): Promise<string> {
  const signedInPerson = createSignedInPerson();
  signedInPerson.set("u1");
  const saleId = await openSaleOfTwoYerbas({ database, signedInPerson });
  new SqliteLocalPaidOrders({ database }).holdAsPendingPayment({
    paymentTransactionId: "qr-1",
    saleId,
    method: "QR",
    provider: "MERCADOPAGO_QR",
    amount,
    createdAt: new Date("2026-10-09T11:59:00.000Z"),
  });
  return saleId;
}

function countingIds(): { next: () => string } {
  let count = 0;
  return {
    next: () => {
      count += 1;
      return `generated-${count}`;
    },
  };
}

function settle({ canSignEvents = true } = {}) {
  return paidOrderSale({
    database,
    outboxChainKey: canSignEvents ? CHARGE_CHAIN_KEY : undefined,
    restoration: restorationOf(database),
    now: () => CHARGE_NOW,
    ids: countingIds(),
  }).settleApprovedPayment({ actorId: "u1", paymentTransactionId: "qr-1" });
}

function saleStates(): unknown[] {
  return database.prepare("SELECT state FROM sales").all();
}

describe("settling a paid order on the sale it pays", () => {
  it("completes the sale the payment covers, naming it", async () => {
    const saleId = await saleHoldingPaidOrder();

    expect(settle()).toEqual({ kind: "completed", saleId });

    expect(saleStates()).toEqual([{ state: "COMPLETED" }]);
    expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([
      { event_type: "sale_completed" },
      { event_type: "deferred_sale_recorded" },
    ]);
  });

  it("leaves the sale open when the payment covers part of it", async () => {
    await saleHoldingPaidOrder(1000);

    expect(settle()).toEqual({ kind: "partially_paid" });

    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });

  it("answers refused, completing nothing, when the sale cannot be completed", async () => {
    await saleHoldingPaidOrder();
    database
      .prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = '2026-10-09T20:00:00.000Z'")
      .run();

    expect(settle()).toEqual({ kind: "refused" });

    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });

  it("fails when the register cannot sign the sale's events", async () => {
    await saleHoldingPaidOrder();

    expect(() => settle({ canSignEvents: false })).toThrow("the ledger has no outbox chain key");
  });
});

describe("settling a paid order into the sale", () => {
  async function discover(
    restorationBegins = false,
  ): Promise<Extract<DiscoverPaidOrdersWithoutSaleOutcome, { kind: "checked" }>> {
    const signedInPerson = createSignedInPerson();
    signedInPerson.set("u1");
    const saleId = await openSaleOfTwoYerbas({ database, signedInPerson }, uuidV7Ids);
    const order: ApprovedOrderOfRegister = {
      paymentTransactionId: PAYMENT_ID,
      saleId,
      method: "QR",
      provider: "MERCADOPAGO_QR",
      amount: 3000,
      createdAt: new Date(CHARGE_NOW.getTime() - 60_000),
    };
    if (restorationBegins) {
      database
        .prepare("UPDATE sync_state SET stale_sequence_detected_at = '2026-10-09T08:00:00.000Z'")
        .run();
    }
    const outcome = await discoverPaidOrdersWithoutSale({
      cloud: { approvedSince: async () => ({ kind: "listed", orders: [order] }) },
      refunds: { openLatePaymentRefund: async () => ({ kind: "refused" }) },
      local: new SqliteLocalPaidOrders({ database }),
      sale: paidOrderSale({
        database,
        restoration: restorationOf(database),
        outboxChainKey: CHARGE_CHAIN_KEY,
        now: () => CHARGE_NOW,
        ids: uuidV7Ids,
      }),
      clock: { now: () => CHARGE_NOW },
    });
    if (outcome.kind !== "checked") {
      throw new Error("test setup: the cloud was not reached");
    }
    return outcome;
  }

  it("leaves the order unhandled, not approved and not lost, when the restoration began meanwhile", async () => {
    const outcome = await discover(true);

    expect(outcome.failed).toBe(1);
    expect(
      database.prepare("SELECT id FROM payment_transactions WHERE id = ?").all(PAYMENT_ID),
    ).toEqual([]);
    expect(database.prepare("SELECT * FROM paid_orders_without_sale").all()).toEqual([]);
  });

  it("completes the sale when no restoration is in progress", async () => {
    const outcome = await discover();

    expect(outcome.completedSaleIds).toHaveLength(1);
  });
});
