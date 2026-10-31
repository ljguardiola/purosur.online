import {
  type ApprovedOrderOfRegister,
  discoverPaidOrdersWithoutSale,
} from "@purosur/domain/payments/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { createSignedInPerson } from "../sessions/signed-in-person";
import { SqliteLocalPaidOrders } from "./sqlite-local-paid-orders";
import {
  openSaleOfTwoYerbas,
  seedChargeRegister,
} from "./test-support/mercado-pago-charge-requests";

const RECORDED_AT = new Date("2026-10-13T12:00:00.000Z");
const RESOLVED_AT = new Date("2026-10-13T12:30:00.000Z");

let database: LocalDatabase;

function localPaidOrders() {
  return new SqliteLocalPaidOrders({ database });
}

type QrOrder = Extract<ApprovedOrderOfRegister, { method: "QR" }>;
type PointOrder = Extract<ApprovedOrderOfRegister, { method: "POINT" }>;

function anOrder(overrides: Partial<QrOrder> = {}): QrOrder {
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

function aPointOrder(overrides: Partial<PointOrder> = {}): PointOrder {
  return {
    ...anOrder(),
    paymentTransactionId: "point-1",
    method: "POINT",
    provider: "MERCADOPAGO_POINT",
    cardType: "DEBIT",
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
    .prepare(
      "SELECT id, sale_id, method, provider, card_type, amount, state FROM payment_transactions",
    )
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

  it("is the state of the payment the register holds and whether the order's sale is still open", async () => {
    const saleId = await openSale();
    addQrPayment("PENDING", saleId);

    expect(localPaidOrders().localStateOf(anOrder({ saleId }))).toEqual({
      payment: "PENDING",
      sale: "open",
    });
  });

  it("tells a sale that is no longer open", async () => {
    const saleId = await openSale();
    database
      .prepare(
        "UPDATE sales SET state = 'CANCELLED', occurred_at = '2026-10-09T12:00:00.000Z' WHERE id = ?",
      )
      .run(saleId);

    expect(localPaidOrders().localStateOf(anOrder({ saleId })).sale).toBe("closed");
  });
});

describe("the cashier of an open sale", () => {
  it("is the one who opened it", async () => {
    const saleId = await openSale();

    expect(localPaidOrders().actorOfSale(saleId)).toBe("u1");
  });

  it("is unknown for a sale the register does not hold", () => {
    expect(localPaidOrders().actorOfSale("sale-gone")).toBeUndefined();
  });
});

describe("holding a paid order as a pending payment of its sale", () => {
  it("records a pending payment the register never held", async () => {
    const saleId = await openSale();

    localPaidOrders().holdAsPendingPayment(anOrder({ saleId }));

    expect(paymentRows()).toEqual([
      {
        id: "qr-1",
        sale_id: saleId,
        method: "QR",
        provider: "MERCADOPAGO_QR",
        card_type: null,
        amount: 3000,
        state: "PENDING",
      },
    ]);
  });

  it.each(["DEBIT", "CREDIT", null] as const)(
    "records a pending payment on the integrated terminal with the card type %s it was charged on",
    async (cardType) => {
      const saleId = await openSale();

      localPaidOrders().holdAsPendingPayment(
        aPointOrder({ saleId, paymentTransactionId: "point-1", cardType }),
      );

      expect(paymentRows()).toMatchObject([
        {
          id: "point-1",
          method: "POINT",
          provider: "MERCADOPAGO_POINT",
          card_type: cardType,
          state: "PENDING",
        },
      ]);
    },
  );

  it.each(["EXPIRED", "CANCELLED", "DECLINED"])(
    "holds again as pending a payment the register had recorded as %s",
    async (state) => {
      const saleId = await openSale();
      addQrPayment(state, saleId);

      localPaidOrders().holdAsPendingPayment(anOrder({ saleId }));

      expect(paymentRows()).toMatchObject([{ id: "qr-1", state: "PENDING" }]);
    },
  );
});

describe("approving a payment held pending", () => {
  it("approves it", async () => {
    const saleId = await openSale();
    addQrPayment("PENDING", saleId);

    localPaidOrders().approvePayment("qr-1");

    expect(paymentRows()).toMatchObject([{ id: "qr-1", state: "APPROVED" }]);
  });
});

describe("working in one transaction", () => {
  it("keeps what the work wrote", async () => {
    const saleId = await openSale();
    const local = localPaidOrders();

    local.inOneTransaction(() => local.holdAsPendingPayment(anOrder({ saleId })));

    expect(paymentRows()).toHaveLength(1);
  });

  it("undoes what the work wrote when it fails", async () => {
    const saleId = await openSale();
    const local = localPaidOrders();

    expect(() =>
      local.inOneTransaction(() => {
        local.holdAsPendingPayment(anOrder({ saleId }));
        throw new Error("the sale could not be settled");
      }),
    ).toThrow("the sale could not be settled");

    expect(paymentRows()).toEqual([]);
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
    local.recordPaidOrderWithoutSale(aPointOrder(), RESOLVED_AT);

    expect(local.paidOrdersWithoutSale().map((order) => order.paymentTransactionId)).toEqual([
      "qr-2",
      "point-1",
    ]);
  });
});

describe("the paid orders a sale was rebuilt against", () => {
  function addApprovedOrderPayment(saleId: string, id = "qr-1"): void {
    database
      .prepare(
        `INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, state, occurred_at, wait_ends_at)
         VALUES (?, ?, 'SALE', 'QR', 'MERCADOPAGO_QR', 3000, 'APPROVED', '2026-10-09T12:00:00.000Z', '2026-10-09T12:00:00.000Z')`,
      )
      .run(id, saleId);
  }

  function endSale(saleId: string, state: "COMPLETED" | "CANCELLED"): void {
    database
      .prepare(
        "UPDATE sales SET state = ?, occurred_at = '2026-10-09T12:05:00.000Z', operation_number = ? WHERE id = ?",
      )
      .run(state, state === "COMPLETED" ? 1 : null, saleId);
  }

  async function rebuiltSale(order = anOrder()): Promise<string> {
    const local = localPaidOrders();
    local.recordPaidOrderWithoutSale(order, RECORDED_AT);
    const saleId = await openSale();
    local.recordSaleRebuiltAgainstPaidOrder(saleId, order.paymentTransactionId);
    return saleId;
  }

  it("offer a QR order with its amount, method and provider", () => {
    localPaidOrders().recordPaidOrderWithoutSale(anOrder(), RECORDED_AT);

    expect(localPaidOrders().rebuildablePaidOrder("qr-1")).toEqual({
      paymentTransactionId: "qr-1",
      amount: 3000,
      resolved: false,
      method: "QR",
      provider: "MERCADOPAGO_QR",
    });
  });

  it.each(["DEBIT", "CREDIT"] as const)(
    "offer a Point order with the %s card type it was paid on",
    (cardType) => {
      localPaidOrders().recordPaidOrderWithoutSale(aPointOrder({ cardType }), RECORDED_AT);

      expect(localPaidOrders().rebuildablePaidOrder("point-1")).toEqual({
        paymentTransactionId: "point-1",
        amount: 3000,
        resolved: false,
        method: "POINT",
        provider: "MERCADOPAGO_POINT",
        cardType,
      });
    },
  );

  it("offer a Point order recorded before card types were kept with no card type", () => {
    database
      .prepare(
        `INSERT INTO paid_orders_without_sale (payment_transaction_id, sale_id, method, provider, amount, created_at, recorded_at)
         VALUES ('point-1', 'sale-gone', 'POINT', 'MERCADOPAGO_POINT', 3000, '2026-10-09T11:59:00.000Z', '2026-10-09T12:00:00.000Z')`,
      )
      .run();

    expect(localPaidOrders().rebuildablePaidOrder("point-1")).toMatchObject({ cardType: null });
  });

  it("offer nothing for a payment that is not a recorded paid order", () => {
    expect(localPaidOrders().rebuildablePaidOrder("qr-1")).toBeUndefined();
  });

  it("are resolved once converted into a refund", () => {
    localPaidOrders().recordPaidOrderWithoutSale(anOrder(), RECORDED_AT);
    localPaidOrders().resolvePaidOrderWithoutSale("qr-1", RESOLVED_AT);

    expect(localPaidOrders().rebuildablePaidOrder("qr-1")?.resolved).toBe(true);
  });

  it("stay unresolved, and are listed with their sale, while the rebuilt sale is open", async () => {
    const saleId = await rebuiltSale();

    expect(localPaidOrders().rebuildablePaidOrder("qr-1")?.resolved).toBe(false);
    expect(localPaidOrders().paidOrdersWithoutSale()).toEqual([
      { ...anOrder(), recordedAt: RECORDED_AT, resolved: false, rebuiltSaleId: saleId },
    ]);
  });

  it("are resolved once the rebuilt sale completed", async () => {
    const saleId = await rebuiltSale();
    addApprovedOrderPayment(saleId);
    endSale(saleId, "COMPLETED");

    expect(localPaidOrders().rebuildablePaidOrder("qr-1")?.resolved).toBe(true);
    expect(localPaidOrders().paidOrdersWithoutSale()[0]).toMatchObject({ resolved: true });
  });

  it("are resolved once the rebuilt sale was cancelled after the order was applied", async () => {
    const saleId = await rebuiltSale();
    addApprovedOrderPayment(saleId);
    endSale(saleId, "CANCELLED");

    expect(localPaidOrders().rebuildablePaidOrder("qr-1")?.resolved).toBe(true);
  });

  it("stay unresolved when the rebuilt sale was cancelled before the order was applied", async () => {
    const saleId = await rebuiltSale();
    endSale(saleId, "CANCELLED");

    expect(localPaidOrders().rebuildablePaidOrder("qr-1")?.resolved).toBe(false);
  });

  it("are found from the sale that was rebuilt against them", async () => {
    const saleId = await rebuiltSale();

    expect(localPaidOrders().paidOrderOfSale(saleId)).toMatchObject({
      paymentTransactionId: "qr-1",
      amount: 3000,
      method: "QR",
    });
    expect(localPaidOrders().paidOrderOfSale("another-sale")).toBeUndefined();
  });

  it("are linked to one sale at a time", async () => {
    await rebuiltSale();
    database
      .prepare(
        `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('sale-2', 'register-1', 'device-1', 'session-1', 'u1', 'CANCELLED', '2026-10-09T12:05:00.000Z')`,
      )
      .run();

    expect(() => localPaidOrders().recordSaleRebuiltAgainstPaidOrder("sale-2", "qr-1")).toThrow(
      /UNIQUE/,
    );
  });

  it("are held by the payment the rebuilt sale took, so a later discovery finds the order recorded", async () => {
    const saleId = await rebuiltSale();
    addApprovedOrderPayment(saleId);
    endSale(saleId, "COMPLETED");

    expect(localPaidOrders().localStateOf(anOrder())).toEqual({
      payment: "APPROVED",
      sale: undefined,
    });
  });

  it("are neither listed again nor refunded when a later discovery finds them in the cloud", async () => {
    const saleId = await rebuiltSale();
    addApprovedOrderPayment(saleId);
    endSale(saleId, "COMPLETED");
    const refunded: string[] = [];

    const outcome = await discoverPaidOrdersWithoutSale({
      cloud: { approvedSince: async () => ({ kind: "listed", orders: [anOrder()] }) },
      refunds: {
        openLatePaymentRefund: async (paymentTransactionId) => {
          refunded.push(paymentTransactionId);
          return { kind: "opened" };
        },
      },
      local: localPaidOrders(),
      sale: { settleApprovedPayment: () => ({ kind: "refused" }) },
      clock: { now: () => RESOLVED_AT },
    });

    expect(outcome).toMatchObject({ kind: "checked", withoutSale: 0, duplicateCharges: 0, failed: 0 });
    expect(refunded).toEqual([]);
    expect(localPaidOrders().paidOrdersWithoutSale()).toHaveLength(1);
    expect(localPaidOrders().rebuildablePaidOrder("qr-1")?.resolved).toBe(true);
  });
});
