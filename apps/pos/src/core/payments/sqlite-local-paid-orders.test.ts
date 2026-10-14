import type { ApprovedOrderOfRegister } from "@purosur/domain/payments/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { SqliteSaleLedger } from "../sales/sqlite-sale-ledger";
import { createSignedInPerson } from "../sessions/signed-in-person";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import { SqliteLocalPaidOrders } from "./sqlite-local-paid-orders";
import {
  CHARGE_CHAIN_KEY,
  CHARGE_NOW,
  openSaleOfTwoYerbas,
  seedChargeRegister,
} from "./test-support/mercado-pago-charge-requests";

const RECORDED_AT = new Date("2026-10-13T12:00:00.000Z");
const RESOLVED_AT = new Date("2026-10-13T12:30:00.000Z");

let database: LocalDatabase;

function localPaidOrders(canSignEvents = true) {
  return new SqliteLocalPaidOrders({
    database,
    settlement: {
      ledger: new SqliteSaleLedger(
        database,
        new SqliteSignInStore(database),
        canSignEvents ? CHARGE_CHAIN_KEY : undefined,
      ),
      clock: { now: () => CHARGE_NOW },
      ids: { next: () => "generated-id" },
    },
  });
}

function anOrder(overrides: Partial<ApprovedOrderOfRegister> = {}): ApprovedOrderOfRegister {
  return {
    paymentTransactionId: "qr-1",
    saleId: "sale-1",
    method: "QR",
    provider: "MERCADOPAGO_QR",
    amount: 3000,
    createdAt: new Date("2026-10-09T11:59:00.000Z"),
    ...overrides,
  };
}

function addQrPayment(state: string, saleId: string): void {
  database
    .prepare(
      `INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, state, occurred_at, wait_ends_at)
       VALUES ('qr-1', ?, 'SALE', 'QR', 'MERCADOPAGO_QR', 3000, ?, '2026-10-09T11:59:00.000Z', '2026-10-09T12:02:00.000Z')`,
    )
    .run(saleId, state);
}

function paymentRows(): unknown[] {
  return database
    .prepare("SELECT id, sale_id, method, provider, amount, state FROM payment_transactions")
    .all();
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  seedChargeRegister(database);
});

afterEach(() => {
  database.close();
});

async function openSale(): Promise<string> {
  const signedInPerson = createSignedInPerson();
  signedInPerson.set("u1");
  return openSaleOfTwoYerbas({ database, signedInPerson });
}

describe("the local state of a paid order", () => {
  it("has neither a payment nor a sale when the register holds nothing of the order", () => {
    expect(localPaidOrders().localStateOf(anOrder())).toEqual({
      payment: undefined,
      sale: undefined,
    });
  });

  it("is the state of the payment the register holds and of the order's sale", async () => {
    const saleId = await openSale();
    addQrPayment("PENDING", saleId);

    expect(localPaidOrders().localStateOf(anOrder({ saleId }))).toEqual({
      payment: "PENDING",
      sale: "OPEN",
    });
  });

  it("tells a sale that is no longer open", async () => {
    const saleId = await openSale();
    database
      .prepare(
        "UPDATE sales SET state = 'CANCELLED', occurred_at = '2026-10-09T12:00:00.000Z' WHERE id = ?",
      )
      .run(saleId);

    expect(localPaidOrders().localStateOf(anOrder({ saleId })).sale).toBe("CANCELLED");
  });
});

describe("applying an approved payment to the open sale", () => {
  it("settles the pending payment the register held and completes the sale it pays", async () => {
    const saleId = await openSale();
    addQrPayment("PENDING", saleId);

    localPaidOrders().applyApprovedPayment(anOrder({ saleId }));

    expect(paymentRows()).toEqual([
      {
        id: "qr-1",
        sale_id: saleId,
        method: "QR",
        provider: "MERCADOPAGO_QR",
        amount: 3000,
        state: "APPROVED",
      },
    ]);
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "COMPLETED" }]);
    expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([
      { event_type: "sale_completed" },
    ]);
  });

  it("records the payment approved when the register never held it", async () => {
    const saleId = await openSale();

    localPaidOrders().applyApprovedPayment(anOrder({ saleId }));

    expect(paymentRows()).toEqual([
      {
        id: "qr-1",
        sale_id: saleId,
        method: "QR",
        provider: "MERCADOPAGO_QR",
        amount: 3000,
        state: "APPROVED",
      },
    ]);
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "COMPLETED" }]);
  });

  it.each(["EXPIRED", "CANCELLED", "DECLINED"])(
    "approves a payment the register had recorded as %s",
    async (state) => {
      const saleId = await openSale();
      addQrPayment(state, saleId);

      localPaidOrders().applyApprovedPayment(anOrder({ saleId }));

      expect(paymentRows()).toMatchObject([{ id: "qr-1", state: "APPROVED" }]);
      expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "COMPLETED" }]);
    },
  );

  it("records a payment on the integrated terminal", async () => {
    const saleId = await openSale();

    localPaidOrders().applyApprovedPayment(
      anOrder({
        saleId,
        paymentTransactionId: "point-1",
        method: "POINT",
        provider: "MERCADOPAGO_POINT",
      }),
    );

    expect(paymentRows()).toMatchObject([
      { id: "point-1", method: "POINT", provider: "MERCADOPAGO_POINT", state: "APPROVED" },
    ]);
  });

  it("leaves the sale open for the cashier when the payment covers part of it", async () => {
    const saleId = await openSale();

    localPaidOrders().applyApprovedPayment(anOrder({ saleId, amount: 1000 }));

    expect(paymentRows()).toMatchObject([{ id: "qr-1", amount: 1000, state: "APPROVED" }]);
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
  });

  it("keeps the payment approved on the open sale when the sale cannot be completed", async () => {
    const saleId = await openSale();
    database
      .prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = '2026-10-09T20:00:00.000Z'")
      .run();

    localPaidOrders().applyApprovedPayment(anOrder({ saleId }));

    expect(paymentRows()).toMatchObject([{ id: "qr-1", state: "APPROVED" }]);
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
  });

  it("changes nothing when the register cannot sign the sale's events", async () => {
    const saleId = await openSale();

    expect(() => localPaidOrders(false).applyApprovedPayment(anOrder({ saleId }))).toThrow();

    expect(paymentRows()).toEqual([]);
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
  });
});

describe("the paid orders without a sale", () => {
  it("are found by their payment once recorded, unresolved", () => {
    localPaidOrders().recordPaidOrderWithoutSale(anOrder(), RECORDED_AT);

    expect(localPaidOrders().paidOrderWithoutSale("qr-1")).toEqual({
      ...anOrder(),
      recordedAt: RECORDED_AT,
      resolved: false,
    });
  });

  it("are not found for another payment", () => {
    localPaidOrders().recordPaidOrderWithoutSale(anOrder(), RECORDED_AT);

    expect(localPaidOrders().paidOrderWithoutSale("qr-2")).toBeUndefined();
  });

  it("are recorded once however many times the same payment is recorded", () => {
    const local = localPaidOrders();
    local.recordPaidOrderWithoutSale(anOrder(), RECORDED_AT);
    local.recordPaidOrderWithoutSale(anOrder({ amount: 9999 }), RESOLVED_AT);

    expect(local.paidOrdersWithoutSale()).toEqual([
      { ...anOrder(), recordedAt: RECORDED_AT, resolved: false },
    ]);
  });

  it("are resolved with the moment they were", () => {
    const local = localPaidOrders();
    local.recordPaidOrderWithoutSale(anOrder(), RECORDED_AT);

    local.resolvePaidOrderWithoutSale("qr-1", RESOLVED_AT);

    expect(local.paidOrderWithoutSale("qr-1")).toEqual({
      ...anOrder(),
      recordedAt: RECORDED_AT,
      resolved: true,
      resolvedAt: RESOLVED_AT,
    });
  });

  it("keep the first resolution when resolved again", () => {
    const local = localPaidOrders();
    local.recordPaidOrderWithoutSale(anOrder(), RECORDED_AT);
    local.resolvePaidOrderWithoutSale("qr-1", RESOLVED_AT);

    local.resolvePaidOrderWithoutSale("qr-1", new Date("2026-10-14T00:00:00.000Z"));

    expect(local.paidOrderWithoutSale("qr-1")?.resolvedAt).toEqual(RESOLVED_AT);
  });

  it("are all listed, in the order they were recorded", () => {
    const local = localPaidOrders();
    local.recordPaidOrderWithoutSale(anOrder({ paymentTransactionId: "qr-2" }), RECORDED_AT);
    local.recordPaidOrderWithoutSale(
      anOrder({ paymentTransactionId: "point-1", method: "POINT", provider: "MERCADOPAGO_POINT" }),
      RESOLVED_AT,
    );

    expect(local.paidOrdersWithoutSale().map((order) => order.paymentTransactionId)).toEqual([
      "qr-2",
      "point-1",
    ]);
  });
});
