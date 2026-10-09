import type { ReceiptDelivery, ReceiptSource } from "@purosur/domain";
import type { ReceiptLedgerTransaction } from "@purosur/domain/sales/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
     INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at, operation_number)
     VALUES ('${saleId}', 'r1', 'device-1', 's1', 'u1', '${state}', ${state === "OPEN" ? "NULL" : `'${COMPLETED_AT}'`}, ${state === "OPEN" ? "NULL" : "(SELECT 482 + count(*) FROM sales)"});`,
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
     INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, promotion_id, discount_amount, line_total)
     VALUES ('${id}', 'sale-1', ${position}, '${product.id}', '${product.name}', ${values.quantity}, ${values.unitPrice}, 'list-1', ${values.discount > 0 ? "'promo-1'" : "NULL"}, ${values.discount}, ${values.total});`,
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
    `INSERT INTO sale_line_promotions (line_id, discount_id, kind, percent, buy_qty, pay_qty)
     VALUES ('line-2', 'promo-1', 'PERCENT_OFF', 10, NULL, NULL),
            ('line-2', 'promo-0', 'BUY_N_PAY_M', NULL, 3, 2);
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

  it("starts with nothing attempted, printed or reprinted", () => {
    insertCompletedSale("sale-1");

    expect(inTransaction((tx) => tx.receiptDelivery("sale-1"))).toEqual<ReceiptDelivery>({
      printAttemptedAt: null,
      printedAt: null,
      reprintCount: 0,
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
      lines: [
        {
          productName: "Yerba a granel",
          saleUnit: "KG",
          quantity: 350,
          listUnitPrice: 1890000,
          promotions: [],
          promotionId: null,
          discountAmount: 0,
          lineTotal: 661500,
        },
        {
          productName: "Alfajor",
          saleUnit: "UNIT",
          quantity: 2,
          listUnitPrice: 42000,
          promotions: [
            { id: "promo-0", benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 } },
            { id: "promo-1", benefit: { kind: "PERCENT_OFF", percent: 10 } },
          ],
          promotionId: "promo-1",
          discountAmount: 8400,
          lineTotal: 75600,
        },
      ],
      payments: [
        { method: "CASH", amount: 500000, tendered: 600000 },
        { method: "TRANSFER", amount: 237100, tendered: null },
      ],
    });
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
