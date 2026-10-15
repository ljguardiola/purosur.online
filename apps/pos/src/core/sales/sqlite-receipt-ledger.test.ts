import type { ReceiptDelivery, ReceiptSource } from "@purosur/domain";
import type { ReceiptLedgerTransaction } from "@purosur/domain/sales/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FACTURA_C,
  insertDeferredSale,
  insertFiscalDocument,
} from "../fiscal/test-support/real-time-authorization-database";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { SqliteReceiptLedger } from "./sqlite-receipt-ledger";

const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
const COMPLETED_AT = "2026-09-30T15:05:00.000Z";

let database: LocalDatabase;
let ledger: SqliteReceiptLedger;

function inTransaction<TOutcome>(work: (tx: ReceiptLedgerTransaction) => TOutcome): TOutcome {
  return ledger.transaction(work);
}

function insertCompletedSale(saleId: string, state = "COMPLETED"): void {
  database.exec(
    `INSERT OR IGNORE INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
     VALUES ('s1', 'r1', 'device-1', 'u1', '2026-09-30T12:00:00.000Z', 0, 'OPEN');
     INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at, operation_number, voided_at)
     VALUES ('${saleId}', 'r1', 'device-1', 's1', 'u1', '${state}', ${state === "OPEN" ? "NULL" : `'${COMPLETED_AT}'`}, ${state === "OPEN" ? "NULL" : "(SELECT 482 + count(*) FROM sales)"}, ${state === "VOIDED" ? `'${COMPLETED_AT}'` : "NULL"});`,
  );
}

function insertLine(
  id: string,
  position: number,
  product: { id: string; name: string; unit: string },
  values: { quantity: number; unitPrice: number; discount: number; total: number },
): void {
  database.exec(
    `INSERT OR IGNORE INTO products (id, name, category_id, sale_unit, active, version)
     VALUES ('${product.id}', '${product.name} del catalogo', 'c', '${product.unit}', 1, 1);
     INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, sale_unit, weight_source, quantity, list_unit_price, price_list_id, promotion_id, discount_amount, line_total)
     VALUES ('${id}', 'sale-1', ${position}, '${product.id}', '${product.name}', '${product.unit}', ${product.unit === "KG" ? "'MANUAL'" : "NULL"}, ${values.quantity}, ${values.unitPrice}, 'list-1', ${values.discount > 0 ? "'promo-1'" : "NULL"}, ${values.discount}, ${values.total});`,
  );
}

function insertSaleWithEverything(): void {
  database.exec(
    `INSERT INTO roles (id, name, is_administrator, version) VALUES ('cashier', 'Cajera', 0, 1);
     INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES ('u1', 'Ada', 'cashier', 's', 1, 1);
     INSERT INTO branch_settings (location_id, address, whatsapp_number, instagram_handle, weekly_hours, expiring_lot_alert_days, unreviewed_price_alert_days, good_condition_return_days, version)
     VALUES ('location-1', 'Av. Belgrano 1450', '11 5555-0100', '@puro.sur', '{}', 30, 30, 15, 1);`,
  );
  insertCompletedSale("sale-1");
  insertLine(
    "line-1",
    1,
    { id: "p-kg", name: "Yerba a granel", unit: "KG" },
    { quantity: 350, unitPrice: 1890000, discount: 0, total: 661500 },
  );
  insertLine(
    "line-2",
    2,
    { id: "p-unit", name: "Alfajor", unit: "UNIT" },
    { quantity: 2, unitPrice: 42000, discount: 8400, total: 75600 },
  );
  database.exec(
    `INSERT INTO sale_line_promotions (line_id, discount_id, name, kind, percent, buy_qty, pay_qty)
     VALUES ('line-2', 'promo-1', 'Promo 10% en alfajores', 'PERCENT_OFF', 10, NULL, NULL),
            ('line-2', 'promo-0', 'Lleve 3, pague 2', 'BUY_N_PAY_M', NULL, 3, 2);
     INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state, occurred_at)
     VALUES ('pay-1', 'sale-1', 'SALE', 'CASH', 'NONE', 500000, 600000, NULL, NULL, 'APPROVED', '${COMPLETED_AT}'),
            ('pay-2', 'sale-1', 'SALE', 'TRANSFER', 'NONE', 237100, NULL, 'u1', '${COMPLETED_AT}', 'APPROVED', '${COMPLETED_AT}');`,
  );
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    "INSERT INTO own_register (id, name, version) VALUES ('r1', 'Caja 1', 1); UPDATE sync_state SET device_id = 'device-1';",
  );
  ledger = new SqliteReceiptLedger(database, CHAIN_KEY);
});

afterEach(() => {
  database.close();
});

describe("a receipt ledger's delivery of a sale", () => {
  it("is unknown for a sale that does not exist and for one that is not completed", () => {
    insertCompletedSale("sale-open", "OPEN");

    expect(inTransaction((tx) => tx.receiptDelivery("missing"))).toBeUndefined();
    expect(inTransaction((tx) => tx.receiptDelivery("sale-open"))).toBeUndefined();
  });

  it("is known for a voided sale, so its detail can still be read", () => {
    insertCompletedSale("sale-gone", "VOIDED");

    expect(inTransaction((tx) => tx.receiptDelivery("sale-gone"))).toMatchObject({
      printAttemptedAt: null,
      printedAt: null,
      reprintCount: 0,
      voided: true,
    });
  });

  it("starts with nothing attempted, printed or reprinted", () => {
    insertCompletedSale("sale-1");

    expect(inTransaction((tx) => tx.receiptDelivery("sale-1"))).toEqual<ReceiptDelivery>({
      printAttemptedAt: null,
      printedAt: null,
      reprintCount: 0,
      voided: false,
    });
  });

  it("holds the moment of the print attempt, the moment it was printed and the reprints counted", () => {
    insertCompletedSale("sale-1");
    const attemptedAt = new Date("2026-09-30T15:06:00.000Z");
    const printedAt = new Date("2026-09-30T15:06:05.000Z");

    inTransaction((tx) => {
      tx.recordPrintAttempt("sale-1", attemptedAt);
    });
    expect(inTransaction((tx) => tx.receiptDelivery("sale-1"))).toEqual({
      printAttemptedAt: attemptedAt,
      printedAt: null,
      reprintCount: 0,
      voided: false,
    });

    inTransaction((tx) => {
      tx.recordPrinted("sale-1", printedAt);
      tx.recordReprint({
        saleId: "sale-1",
        orderNumber: 1,
        requestedBy: "u1",
        authorizedBy: null,
        reason: { kind: "retry" },
        occurredAt: new Date("2026-09-30T15:10:00.000Z"),
      });
      tx.recordReprint({
        saleId: "sale-1",
        orderNumber: 2,
        requestedBy: "u1",
        authorizedBy: "u2",
        reason: { kind: "requested", text: "El cliente lo perdio" },
        occurredAt: new Date("2026-09-30T15:20:00.000Z"),
      });
    });
    expect(inTransaction((tx) => tx.receiptDelivery("sale-1"))).toEqual({
      printAttemptedAt: attemptedAt,
      printedAt,
      reprintCount: 2,
      voided: false,
    });
  });
});

describe("a receipt ledger's recorded reprints", () => {
  it("keep who asked, who authorized, why and when", () => {
    insertCompletedSale("sale-1");

    inTransaction((tx) => {
      tx.recordReprint({
        saleId: "sale-1",
        orderNumber: 1,
        requestedBy: "u1",
        authorizedBy: "u2",
        reason: { kind: "requested", text: "El cliente lo perdio" },
        occurredAt: new Date("2026-09-30T15:10:00.000Z"),
      });
      tx.recordReprint({
        saleId: "sale-1",
        orderNumber: 2,
        requestedBy: "u1",
        authorizedBy: null,
        reason: { kind: "retry" },
        occurredAt: new Date("2026-09-30T15:11:00.000Z"),
      });
    });

    expect(database.prepare("SELECT * FROM sale_reprints ORDER BY order_number").all()).toEqual([
      {
        sale_id: "sale-1",
        order_number: 1,
        requested_by: "u1",
        authorized_by: "u2",
        reason_kind: "requested",
        reason_text: "El cliente lo perdio",
        occurred_at: "2026-09-30T15:10:00.000Z",
      },
      {
        sale_id: "sale-1",
        order_number: 2,
        requested_by: "u1",
        authorized_by: null,
        reason_kind: "retry",
        reason_text: null,
        occurred_at: "2026-09-30T15:11:00.000Z",
      },
    ]);
  });

  it("refuse a second reprint with the same order number", () => {
    insertCompletedSale("sale-1");
    const reprint = {
      saleId: "sale-1",
      orderNumber: 1,
      requestedBy: "u1",
      authorizedBy: null,
      reason: { kind: "retry" } as const,
      occurredAt: new Date("2026-09-30T15:10:00.000Z"),
    };
    inTransaction((tx) => {
      tx.recordReprint(reprint);
    });

    expect(() =>
      inTransaction((tx) => {
        tx.recordReprint(reprint);
      }),
    ).toThrow();
  });
});

describe("a receipt ledger's stored receipt", () => {
  it("is absent until recorded and then comes back byte for byte", () => {
    insertCompletedSale("sale-1");
    expect(inTransaction((tx) => tx.storedReceipt("sale-1"))).toBeUndefined();

    inTransaction((tx) => {
      tx.recordStoredReceipt("sale-1", {
        templateVersion: "1",
        head: Uint8Array.from([0x1b, 0x40, 0x00, 0xff]),
        body: Uint8Array.from([0x41, 0x0a]),
      });
    });

    const stored = inTransaction((tx) => tx.storedReceipt("sale-1"));
    expect(stored?.templateVersion).toBe("1");
    expect(Array.from(stored?.head ?? [])).toEqual([0x1b, 0x40, 0x00, 0xff]);
    expect(Array.from(stored?.body ?? [])).toEqual([0x41, 0x0a]);
    expect(stored?.head).toBeInstanceOf(Uint8Array);
  });
});

describe("a receipt ledger's source of a sale", () => {
  it("cannot be built for a completed sale that never took an operation number", () => {
    insertSaleWithEverything();
    database.exec("UPDATE sales SET operation_number = NULL");

    expect(() => inTransaction((tx) => tx.receiptSource("sale-1"))).toThrow(
      "the sale's receipt cannot be sourced",
    );
  });

  it("totals the amount charged after a discount on the sale's total, leaving each line at its own subtotal", () => {
    insertSaleWithEverything();
    database.exec(
      `UPDATE sales SET sale_discount_kind = 'AMOUNT', sale_discount_value = 100000,
         sale_discount_reason = 'Cliente frecuente'
       WHERE id = 'sale-1'`,
    );

    const source = inTransaction((tx) => tx.receiptSource("sale-1"));

    expect(source.total).toBe(637100);
    expect(source.lines.map((line) => line.lineTotal)).toEqual([661500, 75600]);
    expect(source.saleDiscount).toEqual({ kind: "AMOUNT", amount: 100000 });
  });

  it("carries a percent discount on the sale's total with its percent", () => {
    insertSaleWithEverything();
    database.exec(
      `UPDATE sales SET sale_discount_kind = 'PERCENT', sale_discount_value = 5,
         sale_discount_reason = 'Cliente frecuente'
       WHERE id = 'sale-1'`,
    );

    const source = inTransaction((tx) => tx.receiptSource("sale-1"));

    expect(source.saleDiscount).toEqual({ kind: "PERCENT", percent: 5 });
    expect(source.total).toBe(700245);
  });

  it("holds the branch header, the moment, who served, the operation number, the total, the lines and the payments", () => {
    insertSaleWithEverything();

    const source = inTransaction((tx) => tx.receiptSource("sale-1"));

    expect(source).toEqual<ReceiptSource>({
      header: {
        address: "Av. Belgrano 1450",
        whatsappNumber: "11 5555-0100",
        instagramHandle: "@puro.sur",
      },
      occurredAt: new Date(COMPLETED_AT),
      servedByFirstName: "Ada",
      operationNumber: 482,
      total: 737100,
      saleDiscount: null,
      lines: [
        {
          productName: "Yerba a granel",
          saleUnit: "KG",
          quantity: 350,
          listUnitPrice: 1890000,
          promotions: [],
          promotionId: null,
          manualAdjustment: null,
          discountAmount: 0,
          lineTotal: 661500,
        },
        {
          productName: "Alfajor",
          saleUnit: "UNIT",
          quantity: 2,
          listUnitPrice: 42000,
          promotions: [
            {
              id: "promo-0",
              name: "Lleve 3, pague 2",
              benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 },
            },
            {
              id: "promo-1",
              name: "Promo 10% en alfajores",
              benefit: { kind: "PERCENT_OFF", percent: 10 },
            },
          ],
          promotionId: "promo-1",
          manualAdjustment: null,
          discountAmount: 8400,
          lineTotal: 75600,
        },
      ],
      payments: [
        { method: "CASH", amount: 500000, tendered: 600000 },
        { method: "TRANSFER", amount: 237100, tendered: null },
      ],
      fiscal: { kind: "none" },
    });
  });

  it("keeps the name its promotions had when the sale was completed after they are renamed", () => {
    insertSaleWithEverything();
    database.exec(
      `INSERT INTO discounts (id, name, kind, percent, target_kind, target_id, valid_from, valid_to, weekdays, active, version, removed)
       VALUES ('promo-1', 'Promo 10% en alfajores', 'PERCENT_OFF', 10, 'PRODUCT', 'p-unit', '2026-09-01', '2026-12-31', '[]', 1, 1, 0);
       UPDATE discounts SET name = 'Promo renombrada' WHERE id = 'promo-1';`,
    );

    const { lines } = inTransaction((tx) => tx.receiptSource("sale-1"));

    expect(lines[1]?.promotions.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: "promo-0", name: "Lleve 3, pague 2" },
      { id: "promo-1", name: "Promo 10% en alfajores" },
    ]);
  });
});

describe("a receipt ledger's fiscal document of a sale", () => {
  it("is the one the fiscal records hold for the sale", () => {
    insertSaleWithEverything();
    insertFiscalDocument(database, { state: "AUTHORIZED", pointOfSale: 12, number: 41 });

    const { fiscal } = inTransaction((tx) => tx.receiptSource("sale-1"));

    expect(fiscal).toMatchObject({
      kind: "authorized",
      authorized: { pointOfSale: 12, number: 41, document: FACTURA_C },
    });
  });

  it("is the sale's deferred record when the sale was routed to the deferred flow", () => {
    insertSaleWithEverything();
    const reference = insertDeferredSale(database, "sale-1", "fiscally_offline");

    const { fiscal } = inTransaction((tx) => tx.receiptSource("sale-1"));

    expect(fiscal).toEqual({ kind: "deferred", deferred: reference });
  });
});

describe("a receipt ledger's payments", () => {
  it("hold a Mercado Pago QR payment with nothing tendered", () => {
    insertSaleWithEverything();
    database.exec(
      `INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, state, occurred_at, wait_ends_at)
       VALUES ('pay-3', 'sale-1', 'SALE', 'QR', 'MERCADOPAGO_QR', 100000, 'APPROVED', '${COMPLETED_AT}', '${COMPLETED_AT}');`,
    );

    const source = inTransaction((tx) => tx.receiptSource("sale-1"));

    expect(source?.payments).toEqual([
      { method: "CASH", amount: 500000, tendered: 600000 },
      { method: "TRANSFER", amount: 237100, tendered: null },
      { method: "QR", amount: 100000, tendered: null },
    ]);
  });
});

describe("a receipt ledger's lines", () => {
  it("are read with the unit each was sold by, whatever unit the catalog sells the product by now", () => {
    insertSaleWithEverything();
    database.exec(
      "UPDATE products SET sale_unit = CASE sale_unit WHEN 'KG' THEN 'UNIT' ELSE 'KG' END",
    );

    const source = inTransaction((tx) => tx.receiptSource("sale-1"));

    expect(source.lines.map(({ saleUnit }) => saleUnit)).toEqual(["KG", "UNIT"]);
  });
});

describe("a receipt ledger's adjusted lines", () => {
  it("carry the kind and value of their manual adjustment, and no other detail", () => {
    insertSaleWithEverything();
    database.exec(
      `UPDATE sale_lines SET manual_adjustment_kind = 'PRICE', manual_adjustment_value = 1500000,
         manual_adjustment_reason = 'Caja abierta', manual_adjustment_authorized_by = 'u1'
       WHERE id = 'line-1';
       UPDATE sale_lines SET manual_adjustment_kind = 'PERCENT', manual_adjustment_value = 10,
         manual_adjustment_reason = 'Cliente frecuente'
       WHERE id = 'line-2'`,
    );

    const source = inTransaction((tx) => tx.receiptSource("sale-1"));

    expect(source.lines.map(({ manualAdjustment }) => manualAdjustment)).toEqual([
      { kind: "PRICE", unitPrice: 1500000 },
      { kind: "PERCENT", percent: 10 },
    ]);
  });

  it("carry the amount of an amount discount", () => {
    insertSaleWithEverything();
    database.exec(
      `UPDATE sale_lines SET manual_adjustment_kind = 'AMOUNT', manual_adjustment_value = 300,
         manual_adjustment_reason = 'Envase danado'
       WHERE id = 'line-2'`,
    );

    const source = inTransaction((tx) => tx.receiptSource("sale-1"));

    expect(source.lines[1]?.manualAdjustment).toEqual({ kind: "AMOUNT", amount: 300 });
  });
});

describe("a receipt ledger's outbox", () => {
  const draft = {
    event_id: "event-1",
    aggregate_type: "Sale",
    aggregate_id: "sale-1",
    event_type: "sale_print_state_changed",
    schema_version: 1,
    payload: { sale_id: "sale-1", print_attempted_at: COMPLETED_AT, printed_at: null },
    occurred_at: COMPLETED_AT,
    actor_id: "u1",
  };

  it("is ready only when the register holds its chain key", () => {
    expect(inTransaction((tx) => tx.outboxReady())).toBe(true);
    expect(new SqliteReceiptLedger(database).transaction((tx) => tx.outboxReady())).toBe(false);
  });

  it("takes an appended event and advances the chain", () => {
    inTransaction((tx) => {
      tx.appendOutboxEvent(draft);
    });

    expect(
      database.prepare("SELECT device_seq, aggregate_id, event_type FROM outbox").all(),
    ).toEqual([{ device_seq: 1, aggregate_id: "sale-1", event_type: "sale_print_state_changed" }]);
    expect(database.prepare("SELECT last_device_seq FROM sync_state").get()).toEqual({
      last_device_seq: 1,
    });
  });
});

describe("a receipt ledger's transaction", () => {
  it("leaves nothing behind when the work fails after writing", () => {
    insertCompletedSale("sale-1");

    expect(() =>
      inTransaction((tx) => {
        tx.recordPrintAttempt("sale-1", new Date(COMPLETED_AT));
        throw new Error("the printer is gone");
      }),
    ).toThrow("the printer is gone");

    expect(inTransaction((tx) => tx.receiptDelivery("sale-1"))?.printAttemptedAt).toBeNull();
  });
});
