import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { chargeSaleInCashFor } from "../sales/sale-requests";
import { createSignedInPerson, type SignedInPerson } from "../sessions/signed-in-person";
import {
  abandonMercadoPagoChargeFor,
  followMercadoPagoChargeFor,
  type MercadoPagoChargeRequestDeps,
  startMercadoPagoChargeFor,
} from "./mercado-pago-charge-requests";
import {
  CHARGE_CHAIN_KEY,
  CHARGE_NOW,
  chargeRequestDeps,
  FakeMercadoPagoOrders,
  openSaleOfTwoYerbas,
  seedChargeRegister,
} from "./test-support/mercado-pago-charge-requests";

const NOW = CHARGE_NOW;
const CHAIN_KEY = CHARGE_CHAIN_KEY;

let database: LocalDatabase;
let signedInPerson: SignedInPerson;

class FakeOrders extends FakeMercadoPagoOrders {
  constructor() {
    super(() => database);
  }
}

function deps(
  orders: FakeOrders,
  overrides: Partial<MercadoPagoChargeRequestDeps> = {},
): MercadoPagoChargeRequestDeps {
  return chargeRequestDeps({ database, signedInPerson }, orders, overrides);
}

function saleOfTwoYerbas(): Promise<string> {
  return openSaleOfTwoYerbas({ database, signedInPerson });
}

function qrRows(): unknown[] {
  return database
    .prepare(
      "SELECT id, sale_id, amount, state, wait_ends_at FROM payment_transactions WHERE method = 'QR'",
    )
    .all();
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  seedChargeRegister(database);
  signedInPerson = createSignedInPerson();
  signedInPerson.set("u1");
});

afterEach(() => {
  database.close();
});

describe("starting a Mercado Pago QR charge at the register", () => {
  it("keeps the pending QR payment before asking the cloud for its order, and shows the order", async () => {
    const saleId = await saleOfTwoYerbas();
    const orders = new FakeOrders();

    const outcome = await startMercadoPagoChargeFor(deps(orders), {
      saleId,
      method: "QR",
      amount: 2000,
    });

    expect(outcome).toEqual({
      kind: "order_shown",
      payment_transaction_id: "qr-1",
      amount: 2000,
      remaining_seconds: 180,
      wait_seconds: 180,
    });
    expect(orders.pendingRowsWhenAsked).toEqual([{ id: "qr-1", state: "PENDING" }]);
    expect(orders.requested).toEqual([
      { paymentTransactionId: "qr-1", saleId, method: "QR", amount: 2000 },
    ]);
    expect(qrRows()).toEqual([
      {
        id: "qr-1",
        sale_id: saleId,
        amount: 2000,
        state: "PENDING",
        wait_ends_at: "2026-10-09T12:03:00.000Z",
      },
    ]);
  });

  it("keeps the wait ending at the expiry the cloud recorded for the order", async () => {
    const saleId = await saleOfTwoYerbas();
    const orders = new FakeOrders();
    orders.answer = { kind: "created", expiresAt: new Date("2026-10-09T12:03:10.000Z") };

    expect(
      await startMercadoPagoChargeFor(deps(orders), { saleId, method: "QR", amount: 2000 }),
    ).toMatchObject({
      kind: "order_shown",
      remaining_seconds: 190,
    });
    expect(qrRows()).toMatchObject([{ wait_ends_at: "2026-10-09T12:03:10.000Z" }]);
  });

  it("answers that the amount is more than is left to pay, asking the cloud nothing", async () => {
    const saleId = await saleOfTwoYerbas();
    const orders = new FakeOrders();

    expect(
      await startMercadoPagoChargeFor(deps(orders), { saleId, method: "QR", amount: 5000 }),
    ).toEqual({
      kind: "exceeds_pending",
      pending: 3000,
    });
    expect(orders.requested).toEqual([]);
  });

  it.each([
    ["refused", "order_refused"],
    ["unreachable", "unreachable"],
  ] as const)(
    "answers %s when the cloud does, keeping the payment pending with its wait ended",
    async (answer, kind) => {
      const saleId = await saleOfTwoYerbas();
      const orders = new FakeOrders();
      orders.answer = { kind: answer };

      expect(
        await startMercadoPagoChargeFor(deps(orders), { saleId, method: "QR", amount: 3000 }),
      ).toEqual({
        kind,
      });
      expect(qrRows()).toMatchObject([{ state: "PENDING", wait_ends_at: NOW.toISOString() }]);
      expect(
        await startMercadoPagoChargeFor(deps(new FakeOrders(), { ids: { next: () => "qr-2" } }), {
          saleId,
          method: "QR",
          amount: 3000,
        }),
      ).toMatchObject({ kind: "order_shown", payment_transaction_id: "qr-2" });
    },
  );

  it("refuses a second QR charge of the sale while the first one is in its wait", async () => {
    const saleId = await saleOfTwoYerbas();
    await startMercadoPagoChargeFor(deps(new FakeOrders()), { saleId, method: "QR", amount: 1000 });

    expect(
      await startMercadoPagoChargeFor(deps(new FakeOrders()), {
        saleId,
        method: "QR",
        amount: 1000,
      }),
    ).toEqual({ kind: "mercado_pago_charge_in_progress" });
  });

  it("answers that nobody is signed in, keeping nothing", async () => {
    const saleId = await saleOfTwoYerbas();
    signedInPerson.clear();

    expect(
      await startMercadoPagoChargeFor(deps(new FakeOrders()), {
        saleId,
        method: "QR",
        amount: 3000,
      }),
    ).toEqual({ kind: "not_signed_in" });
    expect(qrRows()).toEqual([]);
  });
});

describe("following a Mercado Pago QR charge at the register", () => {
  async function chargeStarted(amount = 3000): Promise<string> {
    const saleId = await saleOfTwoYerbas();
    await startMercadoPagoChargeFor(deps(new FakeOrders()), { saleId, method: "QR", amount });
    return saleId;
  }

  it("keeps waiting, with the seconds left, while the order is pending", async () => {
    await chargeStarted();

    expect(
      await followMercadoPagoChargeFor(
        deps(new FakeOrders(), { now: () => new Date("2026-10-09T12:00:19.000Z") }),
        { paymentTransactionId: "qr-1" },
      ),
    ).toEqual({ kind: "waiting", remaining_seconds: 161 });
  });

  it("completes the sale with the approved QR payment and sends it to the cloud", async () => {
    const saleId = await chargeStarted();
    const orders = new FakeOrders();
    orders.reading = { kind: "read", state: "APPROVED" };

    expect(
      await followMercadoPagoChargeFor(deps(orders), { paymentTransactionId: "qr-1" }),
    ).toEqual({ kind: "completed", sale_id: saleId, total: 3000 });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "COMPLETED" }]);
    expect(qrRows()).toMatchObject([{ id: "qr-1", state: "APPROVED" }]);
    expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([
      { event_type: "sale_completed" },
    ]);
  });

  it("answers the rest still to pay when the approved QR payment covers part of the sale", async () => {
    const saleId = await chargeStarted(1000);
    const orders = new FakeOrders();
    orders.reading = { kind: "read", state: "APPROVED" };

    expect(
      await followMercadoPagoChargeFor(deps(orders), { paymentTransactionId: "qr-1" }),
    ).toEqual({ kind: "partially_paid", sale_id: saleId, total: 3000, paid: 1000, pending: 2000 });
  });

  it("answers the wait is over, recording the payment expired, when Mercado Pago expires the order", async () => {
    await chargeStarted();
    const orders = new FakeOrders();
    orders.reading = { kind: "read", state: "EXPIRED" };

    expect(
      await followMercadoPagoChargeFor(deps(orders), { paymentTransactionId: "qr-1" }),
    ).toEqual({ kind: "wait_over" });
    expect(qrRows()).toMatchObject([{ state: "EXPIRED" }]);
  });

  it("declines the payment when the order ends another way", async () => {
    await chargeStarted();
    const orders = new FakeOrders();
    orders.reading = { kind: "read", state: "CANCELLED" };

    expect(
      await followMercadoPagoChargeFor(deps(orders), { paymentTransactionId: "qr-1" }),
    ).toEqual({ kind: "declined" });
    expect(qrRows()).toMatchObject([{ state: "CANCELLED" }]);
  });

  it("keeps waiting with no seconds left once 3 minutes pass while the order is pending, leaving the payment pending", async () => {
    await chargeStarted();

    expect(
      await followMercadoPagoChargeFor(
        deps(new FakeOrders(), { now: () => new Date("2026-10-09T12:03:00.000Z") }),
        { paymentTransactionId: "qr-1" },
      ),
    ).toEqual({ kind: "waiting", remaining_seconds: 0 });
    expect(qrRows()).toMatchObject([{ state: "PENDING" }]);
  });

  it("answers it cannot confirm the expiry when the order cannot be read after 3 minutes, leaving the payment pending", async () => {
    await chargeStarted();
    const orders = new FakeOrders();
    orders.reading = { kind: "unreachable" };

    expect(
      await followMercadoPagoChargeFor(
        deps(orders, { now: () => new Date("2026-10-09T12:03:00.000Z") }),
        { paymentTransactionId: "qr-1" },
      ),
    ).toEqual({ kind: "expiry_unconfirmed" });
    expect(qrRows()).toMatchObject([{ state: "PENDING" }]);
  });

  it("answers that no charge is pending for an unknown payment", async () => {
    await chargeStarted();

    expect(
      await followMercadoPagoChargeFor(deps(new FakeOrders()), {
        paymentTransactionId: "missing",
      }),
    ).toEqual({ kind: "not_pending" });
  });

  it.each([
    [
      { kind: "read", state: "PENDING" },
      "2026-10-09T12:00:19.000Z",
      { kind: "waiting", remaining_seconds: 161 },
    ],
    [{ kind: "read", state: "DECLINED" }, "2026-10-09T12:00:19.000Z", { kind: "declined" }],
    [{ kind: "read", state: "EXPIRED" }, "2026-10-09T12:03:00.000Z", { kind: "wait_over" }],
  ] as const)(
    "answers the charge's progress while the outbox cannot sign events (%o at %s)",
    async (reading, now, outcome) => {
      await chargeStarted();
      const orders = new FakeOrders();
      orders.reading = reading;

      expect(
        await followMercadoPagoChargeFor(
          deps(orders, { readOutboxChainKey: async () => undefined, now: () => new Date(now) }),
          { paymentTransactionId: "qr-1" },
        ),
      ).toEqual(outcome);
    },
  );

  it("answers unavailable, settling nothing, while the outbox cannot sign events", async () => {
    await chargeStarted();
    const orders = new FakeOrders();
    orders.reading = { kind: "read", state: "APPROVED" };

    expect(
      await followMercadoPagoChargeFor(
        deps(orders, { readOutboxChainKey: async () => undefined }),
        { paymentTransactionId: "qr-1" },
      ),
    ).toEqual({ kind: "unavailable" });
    expect(qrRows()).toMatchObject([{ state: "PENDING" }]);
  });

  it("answers that nobody is signed in", async () => {
    await chargeStarted();
    signedInPerson.clear();

    expect(
      await followMercadoPagoChargeFor(deps(new FakeOrders()), { paymentTransactionId: "qr-1" }),
    ).toEqual({ kind: "not_signed_in" });
  });
});

describe("abandoning a Mercado Pago QR charge at the register", () => {
  async function chargeStarted(amount = 3000): Promise<string> {
    const saleId = await saleOfTwoYerbas();
    await startMercadoPagoChargeFor(deps(new FakeOrders()), { saleId, method: "QR", amount });
    return saleId;
  }

  function outboxEvents(): unknown[] {
    return database
      .prepare("SELECT event_type, aggregate_id FROM outbox ORDER BY device_seq")
      .all();
  }

  it("cancels the payment once the cloud confirms the cancellation", async () => {
    await chargeStarted();
    const orders = new FakeOrders();

    expect(
      await abandonMercadoPagoChargeFor(deps(orders), { paymentTransactionId: "qr-1" }),
    ).toEqual({ kind: "cancelled" });
    expect(orders.cancelled).toEqual(["qr-1"]);
    expect(qrRows()).toMatchObject([{ state: "CANCELLED" }]);
    expect(outboxEvents()).toEqual([]);
  });

  it("completes the sale with the QR payment the customer already made and sends it to the cloud", async () => {
    const saleId = await chargeStarted();
    const orders = new FakeOrders();
    orders.cancellation = { kind: "answered", state: "APPROVED" };

    expect(
      await abandonMercadoPagoChargeFor(deps(orders), { paymentTransactionId: "qr-1" }),
    ).toEqual({
      kind: "already_paid",
      settlement: { kind: "completed", sale_id: saleId, total: 3000 },
    });
    expect(qrRows()).toMatchObject([{ state: "APPROVED" }]);
    expect(outboxEvents()).toEqual([{ event_type: "sale_completed", aggregate_id: saleId }]);
  });

  it("answers the rest still to pay when the payment already made covers part of the sale", async () => {
    const saleId = await chargeStarted(1000);
    const orders = new FakeOrders();
    orders.cancellation = { kind: "answered", state: "APPROVED" };

    expect(
      await abandonMercadoPagoChargeFor(deps(orders), { paymentTransactionId: "qr-1" }),
    ).toEqual({
      kind: "already_paid",
      settlement: {
        kind: "partially_paid",
        sale_id: saleId,
        total: 3000,
        paid: 1000,
        pending: 2000,
      },
    });
  });

  it("answers the order is closed when it already expired, without asking again", async () => {
    await chargeStarted();
    const orders = new FakeOrders();
    orders.cancellation = { kind: "answered", state: "EXPIRED" };

    expect(
      await abandonMercadoPagoChargeFor(deps(orders), { paymentTransactionId: "qr-1" }),
    ).toEqual({ kind: "closed" });
    expect(qrRows()).toMatchObject([{ state: "EXPIRED" }]);
    expect(
      await abandonMercadoPagoChargeFor(deps(orders), { paymentTransactionId: "qr-1" }),
    ).toEqual({ kind: "not_pending" });
    expect(orders.cancelled).toEqual(["qr-1"]);
  });

  it("marks the payment replaced and sends the replacement, keeping it pending, when the cloud cannot confirm", async () => {
    const saleId = await chargeStarted();
    const orders = new FakeOrders();
    orders.cancellation = { kind: "unreachable" };

    expect(
      await abandonMercadoPagoChargeFor(deps(orders), { paymentTransactionId: "qr-1" }),
    ).toEqual({ kind: "replaced" });
    expect(qrRows()).toMatchObject([{ state: "PENDING", wait_ends_at: NOW.toISOString() }]);
    expect(outboxEvents()).toEqual([{ event_type: "qr_payment_replaced", aggregate_id: saleId }]);
    expect(
      await followMercadoPagoChargeFor(deps(orders), { paymentTransactionId: "qr-1" }),
    ).toEqual({ kind: "not_pending" });
  });

  it("lets the sale complete in cash beside the replaced payment, sending only the cash payment", async () => {
    const saleId = await chargeStarted(1000);
    const orders = new FakeOrders();
    orders.cancellation = { kind: "unreachable" };
    await abandonMercadoPagoChargeFor(deps(orders), { paymentTransactionId: "qr-1" });

    const charged = await chargeSaleInCashFor(
      {
        database,
        gate: deps(orders).gate,
        readOutboxChainKey: async () => CHAIN_KEY,
        now: () => NOW,
        ids: {
          next: (() => {
            let count = 0;
            return () => {
              count += 1;
              return `cash-${count}`;
            };
          })(),
        },
      },
      { saleId, tendered: 3000 },
    );

    expect(charged).toMatchObject({ kind: "completed", sale_id: saleId });
    const completed = database
      .prepare("SELECT payload FROM outbox WHERE event_type = 'sale_completed'")
      .get() as { payload: string };
    expect(
      (JSON.parse(completed.payload) as { payments: { method: string }[] }).payments.map(
        ({ method }) => method,
      ),
    ).toEqual(["CASH"]);
  });

  it("answers unavailable, marking nothing, while the outbox cannot sign events", async () => {
    await chargeStarted();
    const orders = new FakeOrders();
    orders.cancellation = { kind: "unreachable" };

    expect(
      await abandonMercadoPagoChargeFor(
        deps(orders, { readOutboxChainKey: async () => undefined }),
        { paymentTransactionId: "qr-1" },
      ),
    ).toEqual({ kind: "unavailable" });
    expect(
      database.prepare("SELECT replaced FROM payment_transactions WHERE id = 'qr-1'").get(),
    ).toEqual({ replaced: 0 });
  });

  it("answers that no charge is pending for an unknown payment", async () => {
    await chargeStarted();

    expect(
      await abandonMercadoPagoChargeFor(deps(new FakeOrders()), {
        paymentTransactionId: "missing",
      }),
    ).toEqual({ kind: "not_pending" });
  });

  it("answers that nobody is signed in, asking the cloud nothing", async () => {
    await chargeStarted();
    signedInPerson.clear();
    const orders = new FakeOrders();

    expect(
      await abandonMercadoPagoChargeFor(deps(orders), { paymentTransactionId: "qr-1" }),
    ).toEqual({ kind: "not_signed_in" });
    expect(orders.cancelled).toEqual([]);
  });
});
