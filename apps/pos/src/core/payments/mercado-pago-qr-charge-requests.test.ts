import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import type {
  MercadoPagoQrChargeOrderAnswer,
  MercadoPagoQrChargeOrderCancellation,
  MercadoPagoQrChargeOrderReading,
  MercadoPagoQrChargeOrders,
} from "@purosur/domain/payments/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { chargeSaleInCashFor, scanProductFor } from "../sales/sale-requests";
import { createActionGate } from "../sessions/action-gate";
import { createSignedInPerson, type SignedInPerson } from "../sessions/signed-in-person";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import {
  abandonMercadoPagoQrChargeFor,
  followMercadoPagoQrChargeFor,
  type MercadoPagoQrChargeRequestDeps,
  startMercadoPagoQrChargeFor,
} from "./mercado-pago-qr-charge-requests";

const NOW = new Date("2026-10-09T12:00:00.000Z");
const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

let database: LocalDatabase;
let signedInPerson: SignedInPerson;

class FakeOrders implements MercadoPagoQrChargeOrders {
  readonly requested: { paymentTransactionId: string; saleId: string; amount: number }[] = [];
  answer: MercadoPagoQrChargeOrderAnswer = { kind: "created" };
  reading: MercadoPagoQrChargeOrderReading = { kind: "read", state: "PENDING" };
  cancellation: MercadoPagoQrChargeOrderCancellation = { kind: "answered", state: "CANCELLED" };
  cancelled: string[] = [];
  pendingRowsWhenAsked: unknown[] = [];

  async requestOrder(order: { paymentTransactionId: string; saleId: string; amount: number }) {
    this.pendingRowsWhenAsked = database
      .prepare("SELECT id, state FROM payment_transactions WHERE method = 'QR'")
      .all();
    this.requested.push(order);
    return this.answer;
  }

  async readOrder() {
    return this.reading;
  }

  async cancelOrder(paymentTransactionId: string) {
    this.cancelled.push(paymentTransactionId);
    return this.cancellation;
  }
}

function deps(
  orders: FakeOrders,
  overrides: Partial<MercadoPagoQrChargeRequestDeps> = {},
): MercadoPagoQrChargeRequestDeps {
  let count = 0;
  return {
    database,
    gate: createActionGate({
      store: new SqliteSignInStore(database),
      signedInPerson,
      readPepper: async () => undefined,
      hashPin: async () => "",
      now: () => NOW,
    }),
    orders,
    readOutboxChainKey: async () => CHAIN_KEY,
    now: () => NOW,
    ids: {
      next: () => {
        count += 1;
        return `qr-${count}`;
      },
    },
    ...overrides,
  };
}

function seed(): void {
  database.exec(
    `INSERT INTO roles (id, name, is_administrator, version) VALUES ('cashier', 'Cajera', 0, 1);
     INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('cashier', 'sell_and_charge', 1);
     INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES ('u1', 'Ada', 'cashier', 's', 1, 1);
     INSERT INTO own_register (id, name, version) VALUES ('register-1', 'Caja 1', 1);
     UPDATE sync_state SET device_id = 'device-1';
     INSERT INTO buyer_identification_thresholds (id, amount, valid_from, revision)
       VALUES ('threshold-1', 100000000, '2026-01-01', 0);
     INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
       VALUES ('session-1', 'register-1', 'device-1', 'u1', '2026-10-09T08:00:00.000Z', 0, 'OPEN');
     INSERT INTO products (id, name, category_id, sale_unit, active, version)
       VALUES ('p1', 'Yerba', 'c', 'UNIT', 1, 1);
     INSERT INTO product_barcodes (product_id, position, code, active) VALUES ('p1', 1, '111', 1);
     INSERT INTO prices (id, product_id, price_list_id, unit_price, valid_from, version)
       VALUES ('price-1', 'p1', 'list-1', 1500, '2026-09-01T00:00:00.000Z', 1);
     INSERT INTO buyer_tax_status_sets (params_version, set_id, options)
       VALUES (1, 'set-1', '[{"code":5,"description":"Consumidor Final","invoice_class":"A/M/C"}]');`,
  );
  database
    .prepare(
      `INSERT INTO issuer_identification_versions (
         version, legal_name, gross_income_registration, activity_start_date, authorized_cuit, tax_status
       ) VALUES (1, ?, ?, '2020-01-15', ?, 'Condicion de prueba')`,
    )
    .run(FICTIONAL_LEGAL_NAME, FICTIONAL_GROSS_INCOME_REGISTRATION, FICTIONAL_CUIT);
}

async function saleOfTwoYerbas(): Promise<string> {
  const saleDeps = {
    database,
    gate: deps(new FakeOrders()).gate,
    now: () => NOW,
    ids: {
      next: (() => {
        let count = 0;
        return () => {
          count += 1;
          return `sale-id-${count}`;
        };
      })(),
    },
  };
  await scanProductFor(saleDeps, "111");
  const outcome = await scanProductFor(saleDeps, "111");
  if (outcome.kind !== "added") {
    throw new Error("test setup: the product was not added");
  }
  return outcome.sale.id;
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
  seed();
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

    const outcome = await startMercadoPagoQrChargeFor(deps(orders), { saleId, amount: 2000 });

    expect(outcome).toEqual({
      kind: "order_shown",
      payment_transaction_id: "qr-1",
      amount: 2000,
      wait_seconds: 180,
      remaining_seconds: 180,
    });
    expect(orders.pendingRowsWhenAsked).toEqual([{ id: "qr-1", state: "PENDING" }]);
    expect(orders.requested).toEqual([{ paymentTransactionId: "qr-1", saleId, amount: 2000 }]);
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

  it("answers that the amount is more than is left to pay, asking the cloud nothing", async () => {
    const saleId = await saleOfTwoYerbas();
    const orders = new FakeOrders();

    expect(await startMercadoPagoQrChargeFor(deps(orders), { saleId, amount: 5000 })).toEqual({
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

      expect(await startMercadoPagoQrChargeFor(deps(orders), { saleId, amount: 3000 })).toEqual({
        kind,
      });
      expect(qrRows()).toMatchObject([{ state: "PENDING", wait_ends_at: NOW.toISOString() }]);
      expect(
        await startMercadoPagoQrChargeFor(deps(new FakeOrders(), { ids: { next: () => "qr-2" } }), {
          saleId,
          amount: 3000,
        }),
      ).toMatchObject({ kind: "order_shown", payment_transaction_id: "qr-2" });
    },
  );

  it("refuses a second QR charge of the sale while the first one is in its wait", async () => {
    const saleId = await saleOfTwoYerbas();
    await startMercadoPagoQrChargeFor(deps(new FakeOrders()), { saleId, amount: 1000 });

    expect(
      await startMercadoPagoQrChargeFor(deps(new FakeOrders()), { saleId, amount: 1000 }),
    ).toEqual({ kind: "qr_charge_in_progress" });
  });

  it("answers that nobody is signed in, keeping nothing", async () => {
    const saleId = await saleOfTwoYerbas();
    signedInPerson.clear();

    expect(
      await startMercadoPagoQrChargeFor(deps(new FakeOrders()), { saleId, amount: 3000 }),
    ).toEqual({ kind: "not_signed_in" });
    expect(qrRows()).toEqual([]);
  });
});

describe("following a Mercado Pago QR charge at the register", () => {
  async function chargeStarted(amount = 3000): Promise<string> {
    const saleId = await saleOfTwoYerbas();
    await startMercadoPagoQrChargeFor(deps(new FakeOrders()), { saleId, amount });
    return saleId;
  }

  it("keeps waiting, with the seconds left, while the order is pending", async () => {
    await chargeStarted();

    expect(
      await followMercadoPagoQrChargeFor(
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
      await followMercadoPagoQrChargeFor(deps(orders), { paymentTransactionId: "qr-1" }),
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
      await followMercadoPagoQrChargeFor(deps(orders), { paymentTransactionId: "qr-1" }),
    ).toEqual({ kind: "partially_paid", sale_id: saleId, total: 3000, paid: 1000, pending: 2000 });
  });

  it("declines the payment when the order ends another way", async () => {
    await chargeStarted();
    const orders = new FakeOrders();
    orders.reading = { kind: "read", state: "EXPIRED" };

    expect(
      await followMercadoPagoQrChargeFor(deps(orders), { paymentTransactionId: "qr-1" }),
    ).toEqual({ kind: "declined" });
    expect(qrRows()).toMatchObject([{ state: "EXPIRED" }]);
  });

  it("answers the wait is over once 3 minutes pass, leaving the payment pending", async () => {
    await chargeStarted();

    expect(
      await followMercadoPagoQrChargeFor(
        deps(new FakeOrders(), { now: () => new Date("2026-10-09T12:03:00.000Z") }),
        { paymentTransactionId: "qr-1" },
      ),
    ).toEqual({ kind: "wait_over" });
    expect(qrRows()).toMatchObject([{ state: "PENDING" }]);
  });

  it("answers that no charge is pending for an unknown payment", async () => {
    await chargeStarted();

    expect(
      await followMercadoPagoQrChargeFor(deps(new FakeOrders()), {
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
    [{ kind: "read", state: "APPROVED" }, "2026-10-09T12:03:00.000Z", { kind: "wait_over" }],
  ] as const)(
    "answers the charge's progress while the outbox cannot sign events (%o at %s)",
    async (reading, now, outcome) => {
      await chargeStarted();
      const orders = new FakeOrders();
      orders.reading = reading;

      expect(
        await followMercadoPagoQrChargeFor(
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
      await followMercadoPagoQrChargeFor(
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
      await followMercadoPagoQrChargeFor(deps(new FakeOrders()), { paymentTransactionId: "qr-1" }),
    ).toEqual({ kind: "not_signed_in" });
  });
});

describe("abandoning a Mercado Pago QR charge at the register", () => {
  async function chargeStarted(amount = 3000): Promise<string> {
    const saleId = await saleOfTwoYerbas();
    await startMercadoPagoQrChargeFor(deps(new FakeOrders()), { saleId, amount });
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
      await abandonMercadoPagoQrChargeFor(deps(orders), { paymentTransactionId: "qr-1" }),
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
      await abandonMercadoPagoQrChargeFor(deps(orders), { paymentTransactionId: "qr-1" }),
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
      await abandonMercadoPagoQrChargeFor(deps(orders), { paymentTransactionId: "qr-1" }),
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
      await abandonMercadoPagoQrChargeFor(deps(orders), { paymentTransactionId: "qr-1" }),
    ).toEqual({ kind: "closed" });
    expect(qrRows()).toMatchObject([{ state: "EXPIRED" }]);
    expect(
      await abandonMercadoPagoQrChargeFor(deps(orders), { paymentTransactionId: "qr-1" }),
    ).toEqual({ kind: "not_pending" });
    expect(orders.cancelled).toEqual(["qr-1"]);
  });

  it("marks the payment replaced and sends the replacement, keeping it pending, when the cloud cannot confirm", async () => {
    const saleId = await chargeStarted();
    const orders = new FakeOrders();
    orders.cancellation = { kind: "unreachable" };

    expect(
      await abandonMercadoPagoQrChargeFor(deps(orders), { paymentTransactionId: "qr-1" }),
    ).toEqual({ kind: "replaced" });
    expect(qrRows()).toMatchObject([{ state: "PENDING", wait_ends_at: NOW.toISOString() }]);
    expect(outboxEvents()).toEqual([{ event_type: "qr_payment_replaced", aggregate_id: saleId }]);
    expect(
      await followMercadoPagoQrChargeFor(deps(orders), { paymentTransactionId: "qr-1" }),
    ).toEqual({ kind: "not_pending" });
  });

  it("lets the sale complete in cash beside the replaced payment, sending only the cash payment", async () => {
    const saleId = await chargeStarted(1000);
    const orders = new FakeOrders();
    orders.cancellation = { kind: "unreachable" };
    await abandonMercadoPagoQrChargeFor(deps(orders), { paymentTransactionId: "qr-1" });

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
      await abandonMercadoPagoQrChargeFor(
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
      await abandonMercadoPagoQrChargeFor(deps(new FakeOrders()), {
        paymentTransactionId: "missing",
      }),
    ).toEqual({ kind: "not_pending" });
  });

  it("answers that nobody is signed in, asking the cloud nothing", async () => {
    await chargeStarted();
    signedInPerson.clear();
    const orders = new FakeOrders();

    expect(
      await abandonMercadoPagoQrChargeFor(deps(orders), { paymentTransactionId: "qr-1" }),
    ).toEqual({ kind: "not_signed_in" });
    expect(orders.cancelled).toEqual([]);
  });
});
