import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { createSignedInPerson } from "../sessions/signed-in-person";
import { paidOrderSale } from "./paid-order-sale";
import { SqliteLocalPaidOrders } from "./sqlite-local-paid-orders";
import {
  CHARGE_CHAIN_KEY,
  CHARGE_NOW,
  openSaleOfTwoYerbas,
  seedChargeRegister,
} from "./test-support/mercado-pago-charge-requests";

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

function settle({ canSignEvents = true } = {}) {
  return paidOrderSale({
    database,
    outboxChainKey: canSignEvents ? CHARGE_CHAIN_KEY : undefined,
    now: () => CHARGE_NOW,
    ids: { next: () => "generated-id" },
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
