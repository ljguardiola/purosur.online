import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, onTestFinished } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { cancelSaleFor, chargeSaleInCashFor, currentSaleFor } from "../sales/sale-requests";
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

const WAIT_OVER = new Date("2026-10-09T12:30:00.000Z");

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

function pointRows(): unknown[] {
  return database
    .prepare(
      `SELECT id, sale_id, method, provider, amount, state, wait_ends_at, replaced
       FROM payment_transactions WHERE method = 'POINT'`,
    )
    .all();
}

function outboxEvents(): unknown[] {
  return database.prepare("SELECT event_type FROM outbox ORDER BY device_seq").all();
}

async function pointChargeStarted(amount = 3000): Promise<{ saleId: string; paymentId: string }> {
  const saleId = await saleOfTwoYerbas();
  const outcome = await startMercadoPagoChargeFor(deps(new FakeOrders()), {
    saleId,
    method: "POINT",
    amount,
  });
  if (outcome.kind !== "order_shown") {
    throw new Error("test setup: the terminal charge was not started");
  }
  return { saleId, paymentId: outcome.payment_transaction_id };
}

async function openSale() {
  const sale = await currentSaleFor(deps(new FakeOrders()));
  if (sale === null || sale === "not_permitted") {
    throw new Error("test setup: no open sale");
  }
  return sale;
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

describe("starting a charge on the integrated terminal at the register", () => {
  it("keeps the pending terminal payment before asking the cloud for its order, and shows the order", async () => {
    const saleId = await saleOfTwoYerbas();
    const orders = new FakeOrders();

    const outcome = await startMercadoPagoChargeFor(deps(orders), {
      saleId,
      method: "POINT",
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
      { paymentTransactionId: "qr-1", saleId, method: "POINT", amount: 2000 },
    ]);
    expect(pointRows()).toEqual([
      {
        id: "qr-1",
        sale_id: saleId,
        method: "POINT",
        provider: "MERCADOPAGO_POINT",
        amount: 2000,
        state: "PENDING",
        wait_ends_at: "2026-10-09T12:03:00.000Z",
        replaced: 0,
      },
    ]);
  });

  it("answers that the amount is below what the terminal charges, keeping nothing and asking the cloud nothing", async () => {
    const saleId = await saleOfTwoYerbas();
    const orders = new FakeOrders();

    expect(
      await startMercadoPagoChargeFor(deps(orders), { saleId, method: "POINT", amount: 1000 }),
    ).toEqual({ kind: "below_minimum" });
    expect(orders.requested).toEqual([]);
    expect(pointRows()).toEqual([]);
  });

  it.each([
    ["order_refused", { kind: "refused" }],
    ["not_configured", { kind: "not_configured" }],
    ["below_minimum", { kind: "below_minimum" }],
  ] as const)(
    "answers %s when the cloud does, closing the payment so another method can be used",
    async (kind, answer) => {
      const saleId = await saleOfTwoYerbas();
      const orders = new FakeOrders();
      orders.answer = answer;

      expect(
        await startMercadoPagoChargeFor(deps(orders), { saleId, method: "POINT", amount: 3000 }),
      ).toEqual({ kind });
      expect(pointRows()).toMatchObject([{ state: "CANCELLED" }]);
      expect((await openSale()).lines_lock).toBeNull();
    },
  );

  it("keeps the payment pending and names it to be followed when the cloud cannot be reached, as the terminal may already show the order", async () => {
    const saleId = await saleOfTwoYerbas();
    const orders = new FakeOrders();
    orders.answer = { kind: "unreachable" };

    expect(
      await startMercadoPagoChargeFor(deps(orders), { saleId, method: "POINT", amount: 3000 }),
    ).toEqual({
      kind: "order_unconfirmed",
      payment_transaction_id: "qr-1",
      amount: 3000,
      remaining_seconds: 180,
      wait_seconds: 180,
    });
    expect(pointRows()).toMatchObject([{ state: "PENDING" }]);
    expect((await openSale()).lines_lock).toBe("mercado_pago_charge_in_progress");
  });

  it("refuses a second charge while the terminal one is pending", async () => {
    const { saleId } = await pointChargeStarted(1500);

    expect(
      await startMercadoPagoChargeFor(deps(new FakeOrders()), {
        saleId,
        method: "QR",
        amount: 1500,
      }),
    ).toEqual({ kind: "mercado_pago_charge_in_progress" });
  });
});

describe("following a charge on the integrated terminal at the register", () => {
  it("completes the sale with the approved terminal payment and sends it to the cloud", async () => {
    const { saleId, paymentId } = await pointChargeStarted();
    const orders = new FakeOrders();
    orders.reading = { kind: "read", state: "APPROVED" };

    expect(
      await followMercadoPagoChargeFor(deps(orders), { paymentTransactionId: paymentId }),
    ).toEqual({ kind: "completed", sale_id: saleId, total: 3000 });
    expect(pointRows()).toMatchObject([{ state: "APPROVED" }]);
    expect(outboxEvents()).toEqual([{ event_type: "sale_completed" }]);
    const completed = database
      .prepare("SELECT payload FROM outbox WHERE event_type = 'sale_completed'")
      .get() as { payload: string };
    expect(
      (
        JSON.parse(completed.payload) as { payments: { method: string; provider: string }[] }
      ).payments.map(({ method, provider }) => [method, provider]),
    ).toEqual([["POINT", "MERCADOPAGO_POINT"]]);
  });
});

describe("a charge on the integrated terminal whose wait ran out, after the register restarts", () => {
  async function restarted(orders: FakeOrders) {
    return deps(orders, { now: () => WAIT_OVER });
  }

  it("names the pending charge in the open sale read from the same database, and following it resolves it", async () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-point-"));
    onTestFinished(() => rmSync(folder, { recursive: true, force: true }));
    const file = join(folder, "register.db");
    database.close();
    database = openLocalDatabase(file, LOCAL_MIGRATIONS, migrationClock);
    seedChargeRegister(database);
    const { saleId, paymentId } = await pointChargeStarted();
    database.close();
    database = openLocalDatabase(file, LOCAL_MIGRATIONS, migrationClock);
    signedInPerson = createSignedInPerson();
    signedInPerson.set("u1");

    const sale = await currentSaleFor(await restarted(new FakeOrders()));

    expect(sale).toMatchObject({
      id: saleId,
      mercado_pago_charge_in_progress: {
        payment_transaction_id: paymentId,
        method: "POINT",
        amount: 3000,
        remaining_seconds: 0,
        wait_seconds: 180,
      },
    });
    const followed =
      sale !== null && sale !== "not_permitted" ? sale.mercado_pago_charge_in_progress : null;
    const orders = new FakeOrders();
    orders.reading = { kind: "read", state: "APPROVED" };
    expect(
      await followMercadoPagoChargeFor(await restarted(orders), {
        paymentTransactionId: followed?.payment_transaction_id ?? "",
      }),
    ).toEqual({ kind: "completed", sale_id: saleId, total: 3000 });
  });

  it("keeps the sale locked, unable to be cancelled, whatever the clock says", async () => {
    await pointChargeStarted();

    const sale = await currentSaleFor(await restarted(new FakeOrders()));

    expect(sale).toMatchObject({
      lines_lock: "mercado_pago_charge_in_progress",
      cancel_refusal: "mercado_pago_charge_in_progress",
    });
  });

  it("answers that the wait is over at the terminal, keeping the payment pending, while the order is still open", async () => {
    const { paymentId } = await pointChargeStarted();

    expect(
      await followMercadoPagoChargeFor(await restarted(new FakeOrders()), {
        paymentTransactionId: paymentId,
      }),
    ).toEqual({ kind: "at_terminal_wait_over" });
    expect(pointRows()).toMatchObject([{ state: "PENDING" }]);
  });

  it("answers that the wait is over at the terminal while the cloud cannot be reached", async () => {
    const { paymentId } = await pointChargeStarted();
    const orders = new FakeOrders();
    orders.reading = { kind: "unreachable" };

    expect(
      await followMercadoPagoChargeFor(await restarted(orders), {
        paymentTransactionId: paymentId,
      }),
    ).toEqual({ kind: "at_terminal_wait_over" });
    expect(pointRows()).toMatchObject([{ state: "PENDING" }]);
  });

  it.each([
    ["CANCELLED", "closed"],
    ["EXPIRED", "expired"],
  ] as const)(
    "releases the sale once the cloud says the order is %s, answering %s",
    async (state, kind) => {
      const { paymentId } = await pointChargeStarted();
      const orders = new FakeOrders();
      orders.reading = { kind: "read", state };

      expect(
        await followMercadoPagoChargeFor(await restarted(orders), {
          paymentTransactionId: paymentId,
        }),
      ).toEqual({ kind });
      expect(pointRows()).toMatchObject([{ state }]);
      expect(await currentSaleFor(await restarted(new FakeOrders()))).toMatchObject({
        lines_lock: null,
        cancel_refusal: null,
      });
    },
  );

  it("completes the sale once the cloud says the order was approved", async () => {
    const { saleId, paymentId } = await pointChargeStarted();
    const orders = new FakeOrders();
    orders.reading = { kind: "read", state: "APPROVED" };

    expect(
      await followMercadoPagoChargeFor(await restarted(orders), {
        paymentTransactionId: paymentId,
      }),
    ).toEqual({ kind: "completed", sale_id: saleId, total: 3000 });
  });
});

describe("a charge on the integrated terminal while the cloud cannot be reached", () => {
  it("keeps waiting, changing nothing, when the order cannot be read", async () => {
    const { paymentId } = await pointChargeStarted();
    const orders = new FakeOrders();
    orders.reading = { kind: "unreachable" };

    expect(
      await followMercadoPagoChargeFor(
        deps(orders, { now: () => new Date("2026-10-09T12:00:19.000Z") }),
        { paymentTransactionId: paymentId },
      ),
    ).toEqual({ kind: "waiting", remaining_seconds: 161 });
    expect(pointRows()).toMatchObject([{ state: "PENDING", replaced: 0 }]);
  });

  it("answers unreachable when asked to abandon, never marking the payment replaced nor sending anything", async () => {
    const { paymentId } = await pointChargeStarted();
    const orders = new FakeOrders();
    orders.cancellation = { kind: "unreachable" };

    expect(
      await abandonMercadoPagoChargeFor(deps(orders), { paymentTransactionId: paymentId }),
    ).toEqual({ kind: "unreachable" });
    expect(pointRows()).toMatchObject([
      { state: "PENDING", replaced: 0, wait_ends_at: "2026-10-09T12:03:00.000Z" },
    ]);
    expect(outboxEvents()).toEqual([]);
  });

  it("answers that the cancellation is left to the terminal, keeping the payment pending", async () => {
    const { paymentId } = await pointChargeStarted();
    const orders = new FakeOrders();
    orders.cancellation = { kind: "cancel_on_terminal" };

    expect(
      await abandonMercadoPagoChargeFor(deps(orders), { paymentTransactionId: paymentId }),
    ).toEqual({ kind: "cancel_on_terminal" });
    expect(pointRows()).toMatchObject([{ state: "PENDING", replaced: 0 }]);
  });

  it("refuses to cancel the sale", async () => {
    await pointChargeStarted();

    expect(
      await cancelSaleFor({ database, gate: deps(new FakeOrders()).gate, now: () => CHARGE_NOW }),
    ).toEqual({
      kind: "mercado_pago_charge_in_progress",
    });
  });

  it("lets another method pay the sale once the cloud answers again that the order was cancelled", async () => {
    const { saleId, paymentId } = await pointChargeStarted();
    const offline = new FakeOrders();
    offline.reading = { kind: "unreachable" };
    await followMercadoPagoChargeFor(deps(offline), { paymentTransactionId: paymentId });
    expect(
      await chargeSaleInCashFor(
        {
          database,
          gate: deps(offline).gate,
          readOutboxChainKey: async () => CHARGE_CHAIN_KEY,
          now: () => CHARGE_NOW,
          ids: { next: () => "cash-1" },
        },
        { saleId, tendered: 3000 },
      ),
    ).toEqual({ kind: "mercado_pago_charge_in_progress" });

    const online = new FakeOrders();
    online.reading = { kind: "read", state: "CANCELLED" };
    await followMercadoPagoChargeFor(deps(online), { paymentTransactionId: paymentId });

    expect(
      await chargeSaleInCashFor(
        {
          database,
          gate: deps(online).gate,
          readOutboxChainKey: async () => CHARGE_CHAIN_KEY,
          now: () => CHARGE_NOW,
          ids: { next: () => "cash-1" },
        },
        { saleId, tendered: 3000 },
      ),
    ).toMatchObject({ kind: "completed", sale_id: saleId });
  });
});

describe("a charge on the integrated terminal whose order request never reached the cloud", () => {
  async function unconfirmedPointCharge(): Promise<{ saleId: string; paymentId: string }> {
    const saleId = await saleOfTwoYerbas();
    const orders = new FakeOrders();
    orders.answer = { kind: "unreachable" };
    const outcome = await startMercadoPagoChargeFor(deps(orders), {
      saleId,
      method: "POINT",
      amount: 3000,
    });
    if (outcome.kind !== "order_unconfirmed") {
      throw new Error("test setup: the terminal charge was confirmed");
    }
    return { saleId, paymentId: outcome.payment_transaction_id };
  }

  it("keeps the sale locked while the cloud has no record of the payment and cannot confirm its cancellation", async () => {
    const { paymentId } = await unconfirmedPointCharge();
    const orders = new FakeOrders();
    orders.reading = { kind: "not_recorded" };
    orders.cancellation = { kind: "unreachable" };

    await followMercadoPagoChargeFor(deps(orders), { paymentTransactionId: paymentId });

    expect(orders.cancelled).toEqual([paymentId]);
    expect(pointRows()).toMatchObject([{ state: "PENDING" }]);
    expect((await openSale()).lines_lock).toBe("mercado_pago_charge_in_progress");
  });

  it("frees the sale once the cloud confirms it cancelled the payment it had no record of", async () => {
    const { paymentId } = await unconfirmedPointCharge();
    const orders = new FakeOrders();
    orders.reading = { kind: "not_recorded" };
    orders.cancellation = { kind: "answered", state: "CANCELLED" };

    expect(
      await followMercadoPagoChargeFor(deps(orders), { paymentTransactionId: paymentId }),
    ).toEqual({ kind: "closed" });
    expect(pointRows()).toMatchObject([{ state: "CANCELLED" }]);
    expect((await openSale()).lines_lock).toBeNull();
  });
});
