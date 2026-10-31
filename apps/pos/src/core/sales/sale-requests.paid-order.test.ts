import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { restorePendingIn } from "../backups/restore-pending";
import { startMercadoPagoChargeFor } from "../payments/mercado-pago-charge-requests";
import { SqliteLocalPaidOrders } from "../payments/sqlite-local-paid-orders";
import {
  chargeRequestDeps,
  FakeMercadoPagoOrders,
  seedChargeRegister,
} from "../payments/test-support/mercado-pago-charge-requests";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { fixedZoneRulesSource } from "../platform/test-support/fixed-zone-rules-source";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { SqliteRestorationEvidence } from "../register/sqlite-restoration-evidence";
import { createActionGate } from "../sessions/action-gate";
import { createSignedInPerson } from "../sessions/signed-in-person";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import {
  cancelSaleFor,
  chargeSaleInCashFor,
  chargeSaleWithPaidOrderFor,
  currentSaleFor,
  type OutboxSaleRequestDeps,
  rebuildSaleAgainstPaidOrderFor,
  type SellingRequestDeps,
  scanProductFor,
} from "./sale-requests";

const NOW = new Date("2026-10-09T12:00:00.000Z");
const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

let database: LocalDatabase;

function deps(): OutboxSaleRequestDeps & SellingRequestDeps {
  const signedInPerson = createSignedInPerson();
  signedInPerson.set("u1");
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
    readOutboxChainKey: async () => CHAIN_KEY,
    now: () => NOW,
    ids: {
      next: () => {
        count += 1;
        return `id-${count}`;
      },
    },
    paidOrderDiscovery: () => "checked",
    newSalesStoppedByDisk: () => false,
    localDatabaseDamaged: () => false,
    newSalesStoppedByBattery: () => false,
    restoration: new SqliteRestorationEvidence(
      database,
      restorePendingIn(undefined),
      () => "unknown",
      () => false,
    ),
    zoneRules: fixedZoneRulesSource(),
  };
}

function recordPaidOrder(amount: number, method: "QR" | "POINT" = "QR"): void {
  const common = {
    paymentTransactionId: "order-1",
    saleId: "sale-gone",
    amount,
    createdAt: new Date("2026-10-09T11:00:00.000Z"),
  };
  new SqliteLocalPaidOrders({ database }).recordPaidOrderWithoutSale(
    method === "QR"
      ? { ...common, method: "QR", provider: "MERCADOPAGO_QR" }
      : { ...common, method: "POINT", provider: "MERCADOPAGO_POINT", cardType: "CREDIT" },
    NOW,
  );
}

async function rebuildAndSell(yerbas: number): Promise<{ saleId: string }> {
  const rebuilt = await rebuildSaleAgainstPaidOrderFor(deps(), {
    paymentTransactionId: "order-1",
  });
  if (rebuilt.kind !== "rebuilt") {
    throw new Error("test setup: the sale was not rebuilt");
  }
  for (let sold = 0; sold < yerbas; sold += 1) {
    await scanProductFor(deps(), "111");
  }
  return { saleId: rebuilt.sale_id };
}

function outboxOf(type: string) {
  return database
    .prepare<[string], { schema_version: number; payload: string }>(
      "SELECT schema_version, payload FROM outbox WHERE event_type = ?",
    )
    .all(type)
    .map((row) => ({ schemaVersion: row.schema_version, payload: JSON.parse(row.payload) }));
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  seedChargeRegister(database);
});

afterEach(() => {
  database.close();
});

describe("rebuilding a sale against a paid order", () => {
  it("opens an empty sale of its own, linked to the order, that tells the order is still to be applied", async () => {
    recordPaidOrder(3000);

    const outcome = await rebuildSaleAgainstPaidOrderFor(deps(), {
      paymentTransactionId: "order-1",
    });

    expect(outcome).toEqual({ kind: "rebuilt", sale_id: "id-1" });
    expect(await currentSaleFor(deps())).toMatchObject({
      id: "id-1",
      lines: [],
      rebuilt_paid_order: {
        payment_transaction_id: "order-1",
        amount: 3000,
        method: "QR",
        applied: false,
      },
    });
  });

  it("answers that no such paid order is held", async () => {
    expect(
      await rebuildSaleAgainstPaidOrderFor(deps(), { paymentTransactionId: "missing" }),
    ).toEqual({ kind: "not_found" });
  });

  it("answers that the sale is already open when asked again", async () => {
    recordPaidOrder(3000);
    await rebuildSaleAgainstPaidOrderFor(deps(), { paymentTransactionId: "order-1" });

    expect(
      await rebuildSaleAgainstPaidOrderFor(deps(), { paymentTransactionId: "order-1" }),
    ).toEqual({ kind: "already_open", sale_id: "id-1" });
  });

  it("refuses a Point order whose card type is not known yet instead of failing when its sale completes", async () => {
    new SqliteLocalPaidOrders({ database }).recordPaidOrderWithoutSale(
      {
        paymentTransactionId: "order-1",
        saleId: "sale-gone",
        amount: 3000,
        createdAt: new Date("2026-10-09T11:00:00.000Z"),
        method: "POINT",
        provider: "MERCADOPAGO_POINT",
        cardType: null,
      },
      NOW,
    );

    expect(
      await rebuildSaleAgainstPaidOrderFor(deps(), { paymentTransactionId: "order-1" }),
    ).toEqual({ kind: "card_type_unknown" });
    expect(await currentSaleFor(deps())).toBeNull();
  });

  it("answers that another sale is open instead of rebuilding", async () => {
    await scanProductFor(deps(), "111");
    recordPaidOrder(3000);

    expect(
      await rebuildSaleAgainstPaidOrderFor(deps(), { paymentTransactionId: "order-1" }),
    ).toEqual({ kind: "another_sale_open" });
  });

  it("answers that the order was already resolved once converted into a refund", async () => {
    recordPaidOrder(3000);
    new SqliteLocalPaidOrders({ database }).resolvePaidOrderWithoutSale("order-1", NOW);

    expect(
      await rebuildSaleAgainstPaidOrderFor(deps(), { paymentTransactionId: "order-1" }),
    ).toEqual({ kind: "already_resolved" });
  });

  it("is refused to a person who may not sell", async () => {
    recordPaidOrder(3000);
    database.exec(
      "UPDATE role_permissions SET active = 0 WHERE permission_key = 'sell_and_charge'",
    );

    expect(
      await rebuildSaleAgainstPaidOrderFor(deps(), { paymentTransactionId: "order-1" }),
    ).toEqual({ kind: "not_permitted" });
  });
});

describe("charging a rebuilt sale with its paid order", () => {
  it("completes a sale of the order's own amount with its payment, once, resolving the order", async () => {
    recordPaidOrder(3000);
    const { saleId } = await rebuildAndSell(2);

    const outcome = await chargeSaleWithPaidOrderFor(deps(), { saleId });

    expect(outcome).toEqual({
      kind: "completed",
      sale_id: saleId,
      total: 3000,
      applied: 3000,
      surplus: 0,
      surplus_sent_by_cloud: true,
    });
    expect(
      database.prepare("SELECT id, sale_id, state, amount FROM payment_transactions").all(),
    ).toEqual([{ id: "order-1", sale_id: saleId, state: "APPROVED", amount: 3000 }]);
    expect(database.prepare("SELECT state FROM sales WHERE id = ?").get(saleId)).toEqual({
      state: "COMPLETED",
    });
    expect(new SqliteLocalPaidOrders({ database }).rebuildablePaidOrder("order-1")?.resolved).toBe(
      true,
    );
  });

  it("tells the surplus of a Point order is not sent back by the cloud", async () => {
    recordPaidOrder(5000, "POINT");
    const { saleId } = await rebuildAndSell(2);

    const outcome = await chargeSaleWithPaidOrderFor(deps(), { saleId });

    expect(outcome).toMatchObject({
      kind: "completed",
      surplus: 2000,
      surplus_sent_by_cloud: false,
    });
  });

  it("emits the completed sale as version 10 naming the order and the surplus of a higher payment", async () => {
    recordPaidOrder(5000);
    const { saleId } = await rebuildAndSell(2);

    const outcome = await chargeSaleWithPaidOrderFor(deps(), { saleId });

    expect(outcome).toMatchObject({ kind: "completed", total: 3000, applied: 3000, surplus: 2000 });
    expect(outboxOf("sale_completed")).toMatchObject([
      {
        schemaVersion: 10,
        payload: { rebuilt_paid_order: { payment_transaction_id: "order-1", surplus: 2000 } },
      },
    ]);
  });

  it("leaves the remainder pending when the sale's total is above the order, letting another method charge it", async () => {
    recordPaidOrder(3000);
    const { saleId } = await rebuildAndSell(3);

    expect(await chargeSaleWithPaidOrderFor(deps(), { saleId })).toEqual({
      kind: "partially_paid",
      sale_id: saleId,
      total: 4500,
      paid: 3000,
      pending: 1500,
    });
    expect(await currentSaleFor(deps())).toMatchObject({
      rebuilt_paid_order: { applied: true },
      paid: 3000,
      pending: 1500,
    });

    const rest = await chargeSaleInCashFor(deps(), { saleId, tendered: 1500 });

    expect(rest).toMatchObject({ kind: "completed", total: 4500 });
    expect(outboxOf("sale_completed")).toMatchObject([
      { schemaVersion: 10, payload: { rebuilt_paid_order: { surplus: 0 } } },
    ]);
  });

  it("refuses another charge until the order is applied", async () => {
    recordPaidOrder(3000);
    const { saleId } = await rebuildAndSell(2);

    expect(await chargeSaleInCashFor(deps(), { saleId, tendered: 3000 })).toEqual({
      kind: "paid_order_not_applied",
    });
  });

  it("refuses a Mercado Pago charge until the order is applied, asking the provider for nothing", async () => {
    recordPaidOrder(3000);
    const { saleId } = await rebuildAndSell(2);
    const signedInPerson = createSignedInPerson();
    signedInPerson.set("u1");
    const orders = new FakeMercadoPagoOrders(() => database);

    const outcome = await startMercadoPagoChargeFor(
      chargeRequestDeps({ database, signedInPerson }, orders),
      { saleId, method: "QR", amount: 3000 },
    );

    expect(outcome).toEqual({ kind: "paid_order_not_applied" });
    expect(orders.requested).toEqual([]);
  });

  it("answers that the sale was not rebuilt against a paid order", async () => {
    const sale = await scanProductFor(deps(), "111");
    if (sale.kind !== "added") {
      throw new Error("test setup: the product was not added");
    }

    expect(await chargeSaleWithPaidOrderFor(deps(), { saleId: sale.sale.id })).toEqual({
      kind: "no_paid_order",
    });
  });

  it("answers that the order was already applied when charged again", async () => {
    recordPaidOrder(3000);
    const { saleId } = await rebuildAndSell(3);
    await chargeSaleWithPaidOrderFor(deps(), { saleId });

    expect(await chargeSaleWithPaidOrderFor(deps(), { saleId })).toEqual({
      kind: "already_applied",
    });
  });

  it("answers unavailable, charging nothing, when the register holds no outbox chain key", async () => {
    recordPaidOrder(3000);
    const { saleId } = await rebuildAndSell(2);

    expect(
      await chargeSaleWithPaidOrderFor(
        { ...deps(), readOutboxChainKey: async () => undefined },
        { saleId },
      ),
    ).toEqual({ kind: "unavailable" });
    expect(database.prepare("SELECT id FROM payment_transactions").all()).toEqual([]);
  });

  it("charges a Point order with the card type it was paid on", async () => {
    recordPaidOrder(3000, "POINT");
    const { saleId } = await rebuildAndSell(2);

    await chargeSaleWithPaidOrderFor(deps(), { saleId });

    expect(
      database.prepare("SELECT method, provider, card_type FROM payment_transactions").all(),
    ).toEqual([{ method: "POINT", provider: "MERCADOPAGO_POINT", card_type: "CREDIT" }]);
  });
});

describe("cancelling a sale rebuilt against a paid order before it was applied", () => {
  it("drops the sale and its link, so the order can be rebuilt again", async () => {
    recordPaidOrder(3000);
    await rebuildAndSell(1);

    expect(await cancelSaleFor(deps())).toEqual({ kind: "cancelled" });

    expect(database.prepare("SELECT sale_id FROM sales_rebuilt_against_paid_orders").all()).toEqual(
      [],
    );
    expect(outboxOf("sale_cancelled")).toMatchObject([
      { schemaVersion: 10, payload: { rebuilt_paid_order: null } },
    ]);
    expect(
      await rebuildSaleAgainstPaidOrderFor(deps(), { paymentTransactionId: "order-1" }),
    ).toMatchObject({ kind: "rebuilt" });
  });
});
