import type { ApprovedOrderOfRegister } from "@purosur/domain/payments/use-cases";
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
        amount: 3000,
        state: "PENDING",
      },
    ]);
  });

  it("records a pending payment on the integrated terminal", async () => {
    const saleId = await openSale();

    localPaidOrders().holdAsPendingPayment(
      anOrder({
        saleId,
        paymentTransactionId: "point-1",
        method: "POINT",
        provider: "MERCADOPAGO_POINT",
      }),
    );

    expect(paymentRows()).toMatchObject([
      { id: "point-1", method: "POINT", provider: "MERCADOPAGO_POINT", state: "PENDING" },
    ]);
  });

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
