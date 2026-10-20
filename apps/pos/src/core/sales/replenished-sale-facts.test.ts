import type { SaleLine } from "@purosur/domain";
import { aCancelledSaleFact, aCompletedSaleFact } from "@purosur/domain/sync/test-support";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { insertPendingMercadoPagoPayment } from "../payments/sqlite-sale-payments";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { cashBalanceFor } from "../register/cash-session-requests";
import { insertCashMovement, insertOpenedSession } from "../register/sqlite-cash-ledger";
import { addToStockBalance } from "../stock/sqlite-stock-ledger";
import { applyReplenishedSaleFact } from "./replenished-sale-facts";
import {
  insertOpenedSale,
  insertSaleLine,
  insertSalePayment,
  takeOperationNumber,
} from "./sqlite-sale-ledger";

type SaleFact = Extract<
  SyncedFact,
  { kind: "sale_completed" | "sale_cancelled" | "qr_payment_replaced" }
>;

const SOURCE = { eventId: "event-1", deviceId: "device-old" };
const SOLD_AT = new Date("2026-10-07T10:00:00.000Z");

let database: LocalDatabase;

function apply(fact: SaleFact): void {
  applyReplenishedSaleFact(database, fact, SOURCE);
}

function completedSale(
  overrides: Parameters<typeof aCompletedSaleFact>[0] = {},
): Extract<SaleFact, { kind: "sale_completed" }> {
  const fact = aCompletedSaleFact({
    operationNumber: 41,
    cashMovements: [
      {
        id: "movement-sale",
        type: "SALE",
        amount: 2000,
        actorId: "cashier-1",
        occurredAt: SOLD_AT,
      },
      {
        id: "movement-change",
        type: "CHANGE",
        amount: 500,
        actorId: "cashier-1",
        occurredAt: SOLD_AT,
      },
    ],
    stockMovements: [{ id: "stock-1", saleLineId: "line-1", productId: "product-1", delta: -1 }],
    ...overrides,
  });
  return fact;
}

function rows(table: string, order = "rowid"): unknown[] {
  return database.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all();
}

function sale() {
  return database.prepare("SELECT * FROM sales WHERE id = 'sale-1'").get();
}

function stockBalance(): number | undefined {
  return database
    .prepare<[], { quantity: number }>(
      "SELECT quantity FROM stock_balances WHERE product_id = 'product-1'",
    )
    .get()?.quantity;
}

function aSoldLine(id: string): SaleLine {
  return {
    id,
    productId: "product-1",
    productName: "Yerba mate 1 kg",
    saleUnit: "UNIT",
    weightSource: null,
    quantity: 1,
    listUnitPrice: 1500,
    priceListId: "price-list-1",
    promotions: [],
    manualAdjustment: null,
    promotionId: null,
    discountAmount: 0,
    lineTotal: 1500,
  };
}

function snapshotWithAnOpenSale(): void {
  insertOpenedSale(database, {
    id: "sale-1",
    registerId: "register-new",
    deviceId: "device-old",
    sessionId: "session-1",
    actorId: "cashier-1",
    state: "OPEN",
  });
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    `INSERT INTO own_register (id, name, version, removed) VALUES ('register-new', 'Caja 1', 1, 0);
     UPDATE sync_state SET device_id = 'device-new';`,
  );
  insertOpenedSession(database, {
    id: "session-1",
    registerId: "register-new",
    deviceId: "device-old",
    openedBy: "cashier-1",
    openedAt: new Date("2026-10-07T08:00:00.000Z"),
    openingFloat: 5000,
    state: "OPEN",
  });
  insertCashMovement(database, {
    id: "movement-opening",
    sessionId: "session-1",
    type: "OPENING",
    amount: 5000,
    actorId: "cashier-1",
    occurredAt: new Date("2026-10-07T08:00:00.000Z"),
  });
});

afterEach(() => {
  database.close();
});

describe("replenishing a completed sale into a restored register", () => {
  it("holds the sale the snapshot lacks as a completed one, with its operation number and who sold it", () => {
    apply(completedSale());

    expect(sale()).toMatchObject({
      id: "sale-1",
      register_id: "register-new",
      device_id: "device-old",
      session_id: "session-1",
      actor_id: "cashier-1",
      state: "COMPLETED",
      occurred_at: "2026-10-07T10:00:00.000Z",
      operation_number: 41,
    });
  });

  it("holds its lines as they were sold, in the unit the weight source tells", () => {
    apply(
      completedSale({
        lines: [
          {
            id: "line-1",
            productId: "product-1",
            productName: "Yerba mate 1 kg",
            weightSource: null,
            manualAdjustment: null,
            quantity: 2,
            listUnitPrice: 1500,
            priceListId: "price-list-1",
            promotionId: null,
            discountAmount: 0,
            saleDiscountShare: 0,
            lineTotal: 3000,
          },
          {
            id: "line-2",
            productId: "product-2",
            productName: "Queso",
            weightSource: "SCALE",
            manualAdjustment: null,
            quantity: 350,
            listUnitPrice: 9000,
            priceListId: "price-list-1",
            promotionId: null,
            discountAmount: 0,
            saleDiscountShare: 0,
            lineTotal: 3150,
          },
        ],
        stockMovements: null,
      }),
    );

    expect(
      database
        .prepare(
          "SELECT id, position, product_id, product_name, sale_unit, weight_source, quantity, line_total FROM sale_lines ORDER BY position",
        )
        .all(),
    ).toEqual([
      {
        id: "line-1",
        position: 1,
        product_id: "product-1",
        product_name: "Yerba mate 1 kg",
        sale_unit: "UNIT",
        weight_source: null,
        quantity: 2,
        line_total: 3000,
      },
      {
        id: "line-2",
        position: 2,
        product_id: "product-2",
        product_name: "Queso",
        sale_unit: "KG",
        weight_source: "SCALE",
        quantity: 350,
        line_total: 3150,
      },
    ]);
  });

  it("holds its sale discount", () => {
    apply(
      completedSale({
        saleDiscount: { kind: "PERCENT", percent: 10, reason: "regular", authorizedBy: "boss-1" },
      }),
    );

    expect(sale()).toMatchObject({
      sale_discount_kind: "PERCENT",
      sale_discount_value: 10,
      sale_discount_reason: "regular",
      sale_discount_authorized_by: "boss-1",
    });
  });

  it("holds its payments and the cash movements the cashier made for them", () => {
    apply(completedSale());

    expect(
      database
        .prepare(
          "SELECT id, sale_id, kind, method, provider, amount, tendered, state FROM payment_transactions",
        )
        .all(),
    ).toEqual([
      {
        id: "payment-1",
        sale_id: "sale-1",
        kind: "SALE",
        method: "CASH",
        provider: "NONE",
        amount: 1500,
        tendered: 2000,
        state: "APPROVED",
      },
    ]);
    expect(
      database
        .prepare(
          "SELECT id, session_id, type, amount, actor_id, ref_type, ref_id FROM cash_movements WHERE ref_type = 'sale' ORDER BY rowid",
        )
        .all(),
    ).toEqual([
      {
        id: "movement-sale",
        session_id: "session-1",
        type: "SALE",
        amount: 2000,
        actor_id: "cashier-1",
        ref_type: "sale",
        ref_id: "sale-1",
      },
      {
        id: "movement-change",
        session_id: "session-1",
        type: "CHANGE",
        amount: 500,
        actor_id: "cashier-1",
        ref_type: "sale",
        ref_id: "sale-1",
      },
    ]);
  });

  it("makes the cash the open session expects include the sale's cash", () => {
    apply(completedSale());

    expect(cashBalanceFor(database)?.expected).toBe(5000 + 2000 - 500);
  });

  it("holds a payment confirmed by hand with who confirmed it", () => {
    apply(
      completedSale({
        payments: [
          {
            id: "payment-1",
            method: "TRANSFER",
            provider: "NONE",
            amount: 1500,
            tendered: null,
            state: "APPROVED",
            occurredAt: SOLD_AT,
            authorizedBy: "boss-1",
            confirmedAt: new Date("2026-10-07T10:00:30.000Z"),
          },
        ],
        cashMovements: [],
      }),
    );

    expect(
      database
        .prepare("SELECT method, authorized_by, confirmed_at FROM payment_transactions")
        .get(),
    ).toEqual({
      method: "TRANSFER",
      authorized_by: "boss-1",
      confirmed_at: "2026-10-07T10:00:30.000Z",
    });
  });

  it("is refused when a payment confirmed by hand says nobody confirmed it", () => {
    expect(() =>
      apply(
        completedSale({
          payments: [
            {
              id: "payment-1",
              method: "STANDALONE_TERMINAL",
              provider: "EXTERNAL_TERMINAL",
              amount: 1500,
              tendered: null,
              state: "APPROVED",
              occurredAt: SOLD_AT,
              authorizedBy: null,
              confirmedAt: null,
            },
          ],
        }),
      ),
    ).toThrow("payment payment-1 is confirmed by hand but says nobody confirmed it");
  });

  it("holds a Mercado Pago payment as approved", () => {
    apply(
      completedSale({
        payments: [
          {
            id: "payment-1",
            method: "QR",
            provider: "MERCADOPAGO_QR",
            amount: 1500,
            tendered: null,
            state: "APPROVED",
            occurredAt: SOLD_AT,
            authorizedBy: null,
            confirmedAt: null,
          },
        ],
        cashMovements: [],
      }),
    );

    expect(
      database.prepare("SELECT method, provider, state FROM payment_transactions").get(),
    ).toEqual({ method: "QR", provider: "MERCADOPAGO_QR", state: "APPROVED" });
  });

  it("takes the sale's stock out of the balance and keeps the movement that did", () => {
    addToStockBalance(database, "product-1", 10);

    apply(completedSale());

    expect(stockBalance()).toBe(9);
    expect(
      database
        .prepare("SELECT id, product_id, kind, sale_line_id, delta FROM stock_movements")
        .all(),
    ).toEqual([
      { id: "stock-1", product_id: "product-1", kind: "sale", sale_line_id: "line-1", delta: -1 },
    ]);
  });

  it("holds no stock movement for a sale recorded before sales moved stock", () => {
    apply(completedSale({ stockMovements: null }));

    expect(rows("stock_movements")).toEqual([]);
  });

  it("moves the operation counter up to the sale's number, so the next local sale does not repeat it", () => {
    apply(completedSale());

    expect(takeOperationNumber(database)).toBe(42);
  });

  it("leaves the operation counter where it is when the sale's number is lower", () => {
    takeOperationNumber(database);
    takeOperationNumber(database);
    takeOperationNumber(database);

    apply(completedSale({ operationNumber: 2 }));

    expect(takeOperationNumber(database)).toBe(4);
  });

  it("takes the next local operation number for a sale recorded before sales carried one", () => {
    apply(completedSale({ operationNumber: null }));

    expect(sale()).toMatchObject({ operation_number: 1 });
  });

  describe("when the snapshot already holds the sale", () => {
    beforeEach(() => {
      addToStockBalance(database, "product-1", 10);
    });

    it("changes nothing for a sale it holds completed", () => {
      apply(completedSale());
      const before = {
        sales: rows("sales"),
        lines: rows("sale_lines"),
        payments: rows("payment_transactions"),
        movements: rows("cash_movements"),
        stock: rows("stock_movements"),
        balance: stockBalance(),
        counter: rows("operation_counter"),
      };

      apply(completedSale());

      expect({
        sales: rows("sales"),
        lines: rows("sale_lines"),
        payments: rows("payment_transactions"),
        movements: rows("cash_movements"),
        stock: rows("stock_movements"),
        balance: stockBalance(),
        counter: rows("operation_counter"),
      }).toEqual(before);
    });

    it("completes the sale it holds in progress, with the lines the sale ended with", () => {
      snapshotWithAnOpenSale();
      insertSaleLine(database, "sale-1", aSoldLine("line-old"));

      apply(completedSale({ operationNumber: 7 }));

      expect(sale()).toMatchObject({ state: "COMPLETED", operation_number: 7 });
      expect(database.prepare("SELECT id FROM sale_lines").all()).toEqual([{ id: "line-1" }]);
    });

    it("keeps the payment and the cash movement it already holds of the sale in progress", () => {
      snapshotWithAnOpenSale();
      insertSalePayment(database, {
        id: "payment-1",
        saleId: "sale-1",
        kind: "SALE",
        method: "CASH",
        provider: "NONE",
        amount: 1500,
        tendered: 2000,
        state: "APPROVED",
        occurredAt: SOLD_AT,
      });
      insertCashMovement(database, {
        id: "movement-sale",
        sessionId: "session-1",
        type: "SALE",
        amount: 2000,
        actorId: "cashier-1",
        occurredAt: SOLD_AT,
        ref: { type: "sale", id: "sale-1" },
      });

      apply(completedSale());

      expect(database.prepare("SELECT id FROM payment_transactions").all()).toEqual([
        { id: "payment-1" },
      ]);
      expect(
        database
          .prepare("SELECT id FROM cash_movements WHERE ref_id = 'sale-1' ORDER BY rowid")
          .all(),
      ).toEqual([{ id: "movement-sale" }, { id: "movement-change" }]);
    });

    it("approves the Mercado Pago payment it holds pending", () => {
      snapshotWithAnOpenSale();
      insertPendingMercadoPagoPayment(database, {
        id: "payment-1",
        saleId: "sale-1",
        kind: "SALE",
        method: "QR",
        provider: "MERCADOPAGO_QR",
        amount: 1500,
        state: "PENDING",
        occurredAt: SOLD_AT,
        waitEndsAt: new Date("2026-10-07T10:03:00.000Z"),
      });

      apply(
        completedSale({
          payments: [
            {
              id: "payment-1",
              method: "QR",
              provider: "MERCADOPAGO_QR",
              amount: 1500,
              tendered: null,
              state: "APPROVED",
              occurredAt: SOLD_AT,
              authorizedBy: null,
              confirmedAt: null,
            },
          ],
          cashMovements: [],
        }),
      );

      expect(database.prepare("SELECT id, state FROM payment_transactions").all()).toEqual([
        { id: "payment-1", state: "APPROVED" },
      ]);
    });

    it("discards a sale it holds in progress that the register moved on from", () => {
      insertOpenedSale(database, {
        id: "sale-abandoned",
        registerId: "register-new",
        deviceId: "device-old",
        sessionId: "session-1",
        actorId: "cashier-1",
        state: "OPEN",
      });

      apply(completedSale());

      expect(database.prepare("SELECT id, state FROM sales").all()).toEqual([
        { id: "sale-1", state: "COMPLETED" },
      ]);
    });

    it("does not take the sale's stock out of the balance twice when the cloud's copy of the movement is held", () => {
      database
        .prepare(
          "INSERT INTO stock_movements (id, product_id, kind, delta, occurred_at) VALUES ('stock-1', 'product-1', 'sale', -1, ?)",
        )
        .run(SOLD_AT.toISOString());

      apply(completedSale());

      expect(stockBalance()).toBe(10);
      expect(database.prepare("SELECT id FROM stock_movements").all()).toEqual([{ id: "stock-1" }]);
    });
  });
});

describe("replenishing a cancelled sale into a restored register", () => {
  it("holds the sale the snapshot lacks as a cancelled one, with its refund and who authorized it", () => {
    apply(aCancelledSaleFact());

    expect(sale()).toMatchObject({
      state: "CANCELLED",
      occurred_at: "2026-10-07T10:05:00.000Z",
      cancellation_authorized_by: "supervisor-1",
    });
    expect(
      database
        .prepare("SELECT id, payment_id, method, provider, amount, state FROM payment_refunds")
        .all(),
    ).toEqual([
      {
        id: "refund-1",
        payment_id: "payment-1",
        method: "CASH",
        provider: "NONE",
        amount: 1000,
        state: "APPROVED",
      },
    ]);
  });

  it("holds the cash the sale took in and gave back", () => {
    apply(aCancelledSaleFact());

    expect(cashBalanceFor(database)?.expected).toBe(5000);
  });

  it("cancels the sale it holds in progress", () => {
    snapshotWithAnOpenSale();

    apply(aCancelledSaleFact());

    expect(database.prepare("SELECT id, state FROM sales").all()).toEqual([
      { id: "sale-1", state: "CANCELLED" },
    ]);
  });

  it("changes nothing for a sale it holds cancelled", () => {
    apply(aCancelledSaleFact());
    const before = {
      sales: rows("sales"),
      payments: rows("payment_transactions"),
      refunds: rows("payment_refunds"),
      movements: rows("cash_movements"),
    };

    apply(aCancelledSaleFact());

    expect({
      sales: rows("sales"),
      payments: rows("payment_transactions"),
      refunds: rows("payment_refunds"),
      movements: rows("cash_movements"),
    }).toEqual(before);
  });
});

describe("replenishing a replaced QR payment into a restored register", () => {
  const replaced: SaleFact = {
    kind: "qr_payment_replaced",
    replacement: { paymentTransactionId: "payment-1", saleId: "sale-1" },
  };

  function pendingQrPayment(): void {
    snapshotWithAnOpenSale();
    insertPendingMercadoPagoPayment(database, {
      id: "payment-1",
      saleId: "sale-1",
      kind: "SALE",
      method: "QR",
      provider: "MERCADOPAGO_QR",
      amount: 1500,
      state: "PENDING",
      occurredAt: SOLD_AT,
      waitEndsAt: new Date("2026-10-07T10:03:00.000Z"),
    });
  }

  it("stops following the QR payment the snapshot holds pending, keeping the wait it had", () => {
    pendingQrPayment();

    apply(replaced);

    expect(
      database.prepare("SELECT state, replaced, wait_ends_at FROM payment_transactions").get(),
    ).toEqual({ state: "PENDING", replaced: 1, wait_ends_at: "2026-10-07T10:03:00.000Z" });
  });

  it("changes nothing when the snapshot already stopped following it", () => {
    pendingQrPayment();
    apply(replaced);
    const before = rows("payment_transactions");

    apply(replaced);

    expect(rows("payment_transactions")).toEqual(before);
  });

  it("changes nothing when the snapshot does not hold the payment", () => {
    apply(replaced);

    expect(rows("payment_transactions")).toEqual([]);
  });
});
