import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import {
  addScannedProduct,
  chargeSaleByTransfer,
  chargeSaleInCash,
  voidSale,
} from "@purosur/domain/sales/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  insertFiscalDocument,
  insertHealthCheck,
  insertOfflineFiscalDocument,
  insertOfflinePointOfSale,
} from "../fiscal/test-support/real-time-authorization-database";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import { SqliteSaleLedger } from "./sqlite-sale-ledger";
import { SqliteSaleVoidLedger } from "./sqlite-sale-void-ledger";
import { addPrice, addProduct } from "./test-support/sqlite-sale-ledger";

const NOW = new Date("2026-09-30T12:00:00.000Z");
const VOIDED_AT = new Date("2026-09-30T12:30:00.000Z");
const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

let database: LocalDatabase;
let sales: SqliteSaleLedger;
let idCount: number;

const ids = {
  next: () => {
    idCount += 1;
    return `id-${idCount}`;
  },
};

function voidLedger(chainKey: string | null = CHAIN_KEY): SqliteSaleVoidLedger {
  return new SqliteSaleVoidLedger(database, chainKey ?? undefined);
}

function sellTwo(): string {
  addScannedProduct(
    { ledger: sales, clock: { now: () => NOW }, ids },
    { actorId: "u1", code: "111" },
  );
  const outcome = addScannedProduct(
    { ledger: sales, clock: { now: () => NOW }, ids },
    { actorId: "u1", code: "111" },
  );
  if (outcome.kind !== "added") {
    throw new Error("test setup: the product was not added");
  }
  return outcome.sale.id;
}

function payCash(saleId: string, tendered: number): void {
  chargeSaleInCash(
    { ledger: sales, clock: { now: () => NOW }, ids },
    { actorId: "u1", saleId, tendered },
  );
}

function payByTransfer(saleId: string, amount: number): void {
  chargeSaleByTransfer(
    { ledger: sales, clock: { now: () => NOW }, ids },
    { actorId: "u1", saleId, amount },
  );
}

function voidIt(saleId: string, options: { authorizedBy?: string; confirmed?: boolean } = {}) {
  return voidSale(
    {
      ledger: voidLedger(),
      clock: { now: () => VOIDED_AT },
      ids,
      authority: {
        authorize: async () => ({
          kind: "granted",
          grant: { actorId: "u1", authorizedBy: options.authorizedBy },
        }),
      },
    },
    { saleId, pendingRefundsConfirmed: options.confirmed ?? false },
  );
}

function toVoid(saleId: string) {
  return voidLedger().transaction((tx) => tx.saleToVoid(saleId));
}

beforeEach(() => {
  idCount = 0;
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  sales = new SqliteSaleLedger(
    database,
    new SqliteSignInStore(database),
    CHAIN_KEY,
    () => "checked",
  );
  database.exec(
    `INSERT INTO roles (id, name, is_administrator, version) VALUES ('cashier', 'Cajera', 0, 1);
     INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES ('u1', 'Ada', 'cashier', 's', 1, 1);
     INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('cashier', 'sell_and_charge', 1);
     INSERT INTO own_register (id, name, version) VALUES ('register-1', 'Caja 1', 1);
     UPDATE sync_state SET device_id = 'device-1';
     INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
     VALUES ('session-1', 'register-1', 'device-1', 'u1', '2026-09-30T08:00:00.000Z', 0, 'OPEN');
     INSERT INTO buyer_identification_thresholds (id, amount, valid_from, revision)
     VALUES ('threshold-1', 100000000, '2026-01-01', 0);
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
  addProduct(database, "111");
  addPrice(database, "p1", "2026-09-01T00:00:00.000Z", 1500);
});

afterEach(() => {
  database.close();
});

describe("the sale to void", () => {
  it("is none for a sale the register does not hold", () => {
    expect(toVoid("missing")).toBeUndefined();
  });

  it("carries the sale, its payments, its deferred record and the stock it took out", () => {
    const saleId = sellTwo();
    payCash(saleId, 3000);

    const found = toVoid(saleId);

    expect(found).toMatchObject({
      sale: { id: saleId, state: "COMPLETED", sessionId: "session-1" },
      inOpenSession: true,
      payments: [{ method: "CASH", amount: 3000, state: "APPROVED", occurredAt: NOW }],
      fiscalDocuments: [],
      deferredRecord: { satisfied: false },
    });
    expect(found?.sale.lines).toHaveLength(1);
    expect(found?.stockMovements).toEqual(
      database
        .prepare<[], { id: string; sale_line_id: string; product_id: string; delta: number }>(
          "SELECT id, sale_line_id, product_id, delta FROM stock_movements WHERE kind = 'sale'",
        )
        .all()
        .map((row) => ({
          id: row.id,
          saleLineId: row.sale_line_id,
          productId: row.product_id,
          delta: row.delta,
          occurredAt: NOW,
        })),
    );
    expect(found?.stockMovements).toHaveLength(1);
  });

  it("is outside the open session once its session closed", () => {
    const saleId = sellTwo();
    payCash(saleId, 3000);
    database.exec(
      "UPDATE cash_sessions SET state = 'CLOSED', closed_at = '2026-09-30T20:00:00.000Z'",
    );

    expect(toVoid(saleId)?.inOpenSession).toBe(false);
  });

  it("is outside the open session when another session is the open one", () => {
    const saleId = sellTwo();
    payCash(saleId, 3000);
    database.exec(
      `UPDATE cash_sessions SET state = 'CLOSED', closed_at = '2026-09-30T20:00:00.000Z';
       INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
       VALUES ('session-2', 'register-1', 'device-1', 'u1', '2026-10-01T08:00:00.000Z', 0, 'OPEN')`,
    );

    expect(toVoid(saleId)?.inOpenSession).toBe(false);
  });

  it("lists the payments that were never approved next to the approved one", () => {
    const saleId = sellTwo();
    payCash(saleId, 3000);
    database
      .prepare(
        `INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, state, occurred_at, wait_ends_at)
         VALUES ('qr-1', ?, 'SALE', 'QR', 'MERCADOPAGO_QR', 500, 'EXPIRED', '2026-09-30T11:59:00.000Z', '2026-09-30T11:59:30.000Z')`,
      )
      .run(saleId);

    expect(toVoid(saleId)?.payments.map(({ method, state }) => [method, state])).toEqual([
      ["CASH", "APPROVED"],
      ["QR", "EXPIRED"],
    ]);
  });

  it("names the state, number and buyer of the invoice the sale requested", () => {
    const saleId = sellTwo();
    payCash(saleId, 3000);
    database.exec("DELETE FROM deferred_sales");
    insertFiscalDocument(database, { saleId, state: "UNKNOWN", pointOfSale: 12, number: 41 });

    expect(toVoid(saleId)?.fiscalDocuments).toEqual([
      { origin: "real_time", state: "UNKNOWN", pointOfSale: 12, number: 41, buyerTaxStatusCode: 5 },
    ]);
    expect(toVoid(saleId)?.deferredRecord).toBeNull();
  });

  it("counts a contingency document as an authorized one", () => {
    const saleId = sellTwo();
    payCash(saleId, 3000);
    insertOfflinePointOfSale(database);
    insertOfflineFiscalDocument(database, { saleId, pointOfSale: 31, number: 8 });

    expect(toVoid(saleId)?.fiscalDocuments).toEqual([
      { origin: "offline", state: "AUTHORIZED", pointOfSale: 31, number: 8, buyerTaxStatusCode: 5 },
    ]);
  });

  it("carries a sale that is not completed as it is", () => {
    const saleId = sellTwo();

    expect(toVoid(saleId)?.sale.state).toBe("OPEN");
  });

  it("carries no deferred record once it was cancelled", async () => {
    const saleId = sellTwo();
    payCash(saleId, 3000);
    await voidIt(saleId);

    expect(toVoid(saleId)).toMatchObject({ sale: { state: "VOIDED" }, deferredRecord: null });
  });
});

describe("the evidence that the register is fiscally online", () => {
  it("is that of the latest health check", () => {
    insertHealthCheck(database, { checkedAt: "2026-09-30T12:00:00.000Z" });
    insertHealthCheck(database, {
      checkedAt: "2026-09-30T12:00:05.000Z",
      tokenValid: false,
      arcaReachable: true,
    });

    expect(voidLedger().transaction((tx) => tx.fiscalOnlineEvidence())).toEqual({
      lastHealthCheckOkAt: new Date("2026-09-30T12:00:05.000Z"),
      tokenValid: false,
      arcaReachable: true,
    });
  });

  it("is none while the register never checked its health", () => {
    expect(voidLedger().transaction((tx) => tx.fiscalOnlineEvidence())).toEqual({
      lastHealthCheckOkAt: null,
      tokenValid: false,
      arcaReachable: false,
    });
  });
});

describe("the credit note of a voided sale", () => {
  const CREDIT_NOTE = {
    creditNoteId: "note-1",
    total: 3000,
    receiverTaxStatusCode: 5,
    correctedVoucher: { voucherType: 11, pointOfSale: 12, number: 41 },
  };

  function recordCreditNote(saleId: string, creditNoteId = "note-1") {
    voidLedger().transaction((tx) => {
      tx.recordVoidedSale(saleId, VOIDED_AT, undefined);
      tx.recordPendingCreditNote({ ...CREDIT_NOTE, creditNoteId, saleId });
    });
  }

  it("is recorded in progress, with the voucher it corrects, when the sale is voided", () => {
    const saleId = sellTwo();
    payCash(saleId, 3000);

    recordCreditNote(saleId);

    expect(
      database
        .prepare(
          `SELECT id, sale_id, total, receiver_tax_status_code, corrected_voucher_type,
                  corrected_point_of_sale, corrected_number, state, recorded_at, answered_at
           FROM sale_void_credit_notes`,
        )
        .all(),
    ).toEqual([
      {
        id: "note-1",
        sale_id: saleId,
        total: 3000,
        receiver_tax_status_code: 5,
        corrected_voucher_type: 11,
        corrected_point_of_sale: 12,
        corrected_number: 41,
        state: "IN_PROGRESS",
        recorded_at: VOIDED_AT.toISOString(),
        answered_at: null,
      },
    ]);
  });

  it("is recorded once per sale", () => {
    const saleId = sellTwo();
    payCash(saleId, 3000);
    recordCreditNote(saleId);

    expect(() =>
      voidLedger().transaction((tx) =>
        tx.recordPendingCreditNote({ ...CREDIT_NOTE, creditNoteId: "note-2", saleId }),
      ),
    ).toThrow(/UNIQUE/);
  });

  it("is left out when the void is rolled back", async () => {
    const saleId = sellTwo();
    payCash(saleId, 3000);
    insertFiscalDocument(database, { saleId, state: "AUTHORIZED" });
    insertHealthCheck(database, { checkedAt: VOIDED_AT.toISOString() });
    database.exec(
      `CREATE TRIGGER refuse_voided_events BEFORE INSERT ON outbox
       WHEN NEW.event_type = 'sale_voided'
       BEGIN SELECT RAISE(ABORT, 'outbox refused'); END`,
    );

    await expect(voidIt(saleId)).rejects.toThrow("outbox refused");

    expect(database.prepare("SELECT count(*) AS total FROM sale_void_credit_notes").get()).toEqual({
      total: 0,
    });
  });

  it("is recorded with the void of an invoiced sale, beside its event", async () => {
    const saleId = sellTwo();
    payCash(saleId, 3000);
    insertFiscalDocument(database, { saleId, state: "AUTHORIZED", pointOfSale: 12, number: 41 });
    insertHealthCheck(database, { checkedAt: VOIDED_AT.toISOString() });

    const outcome = await voidIt(saleId);

    expect(outcome).toMatchObject({ kind: "voided", creditNote: { saleId } });
    expect(
      database
        .prepare(
          "SELECT sale_id, corrected_point_of_sale, corrected_number, state FROM sale_void_credit_notes",
        )
        .all(),
    ).toEqual([
      { sale_id: saleId, corrected_point_of_sale: 12, corrected_number: 41, state: "IN_PROGRESS" },
    ]);
  });
});

describe("voiding a sale", () => {
  it("records the sale as voided at the moment of the voiding, keeping its lines and payment", async () => {
    const saleId = sellTwo();
    payCash(saleId, 3000);

    await expect(voidIt(saleId)).resolves.toMatchObject({ kind: "voided" });

    expect(
      database
        .prepare("SELECT id, state, occurred_at, voided_at, void_authorized_by FROM sales")
        .all(),
    ).toEqual([
      {
        id: saleId,
        state: "VOIDED",
        occurred_at: NOW.toISOString(),
        voided_at: VOIDED_AT.toISOString(),
        void_authorized_by: null,
      },
    ]);
    expect(database.prepare("SELECT quantity FROM sale_lines").all()).toEqual([{ quantity: 2 }]);
    expect(database.prepare("SELECT method, amount FROM payment_transactions").all()).toEqual([
      { method: "CASH", amount: 3000 },
    ]);
  });

  it("records who authorized the voiding", async () => {
    const saleId = sellTwo();
    payCash(saleId, 3000);

    await voidIt(saleId, { authorizedBy: "u2" });

    expect(database.prepare("SELECT void_authorized_by FROM sales").all()).toEqual([
      { void_authorized_by: "u2" },
    ]);
  });

  it("gives the cash payment back with a refund and a refund cash movement against the sale", async () => {
    const saleId = sellTwo();
    payCash(saleId, 3000);

    await voidIt(saleId, { authorizedBy: "u2" });

    expect(
      database
        .prepare("SELECT method, provider, amount, state, occurred_at FROM payment_refunds")
        .all(),
    ).toEqual([
      {
        method: "CASH",
        provider: "NONE",
        amount: 3000,
        state: "APPROVED",
        occurred_at: VOIDED_AT.toISOString(),
      },
    ]);
    expect(
      database
        .prepare(
          "SELECT type, amount, ref_type, ref_id, authorized_by FROM cash_movements WHERE type = 'REFUND'",
        )
        .all(),
    ).toEqual([
      { type: "REFUND", amount: 3000, ref_type: "sale", ref_id: saleId, authorized_by: "u2" },
    ]);
  });

  it("leaves a transfer refund pending, with no cash movement, once the cashier confirmed it", async () => {
    const saleId = sellTwo();
    payByTransfer(saleId, 3000);

    await voidIt(saleId, { confirmed: true });

    expect(database.prepare("SELECT method, amount, state FROM payment_refunds").all()).toEqual([
      { method: "TRANSFER", amount: 3000, state: "PENDING" },
    ]);
    expect(
      database.prepare("SELECT count(*) AS total FROM cash_movements WHERE type = 'REFUND'").get(),
    ).toEqual({ total: 0 });
  });

  it.each([
    ["QR", "MERCADOPAGO_QR"],
    ["POINT", "MERCADOPAGO_POINT"],
  ])(
    "leaves the refund of a Mercado Pago %s payment pending on its provider and in the event",
    async (method, provider) => {
      const saleId = sellTwo();
      payCash(saleId, 3000);
      database
        .prepare(
          `INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, state, occurred_at, wait_ends_at)
         VALUES ('mp-1', ?, 'SALE', ?, ?, 500, 'APPROVED', ?, ?)`,
        )
        .run(saleId, method, provider, NOW.toISOString(), NOW.toISOString());

      await voidIt(saleId, { confirmed: true });

      expect(
        database
          .prepare(
            "SELECT payment_id, method, provider, amount, state FROM payment_refunds WHERE payment_id = 'mp-1'",
          )
          .all(),
      ).toEqual([{ payment_id: "mp-1", method, provider, amount: 500, state: "PENDING" }]);
      const event = database
        .prepare("SELECT schema_version, payload FROM outbox WHERE event_type = 'sale_voided'")
        .get() as { schema_version: number; payload: string };
      expect(event.schema_version).toBe(2);
      expect(JSON.parse(event.payload).refunds).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ parent_id: "mp-1", method, provider, state: "PENDING" }),
        ]),
      );
    },
  );

  it("gives back to the shelf, line by line, what the sale took out", async () => {
    const saleId = sellTwo();
    payCash(saleId, 3000);
    const lineId = database.prepare<[], { id: string }>("SELECT id FROM sale_lines").get()?.id;
    const taken = database
      .prepare<[], { delta: number }>("SELECT delta FROM stock_movements WHERE kind = 'sale'")
      .get()?.delta as number;

    await voidIt(saleId);

    expect(
      database
        .prepare(
          "SELECT kind, sale_line_id, product_id, delta, occurred_at FROM stock_movements WHERE kind = 'sale_void'",
        )
        .all(),
    ).toEqual([
      {
        kind: "sale_void",
        sale_line_id: lineId,
        product_id: "p1",
        delta: -taken,
        occurred_at: VOIDED_AT.toISOString(),
      },
    ]);
    expect(database.prepare("SELECT quantity FROM stock_balances").all()).toEqual([
      { quantity: 0 },
    ]);
  });

  it("cancels the deferred record of a sale that never got an invoice", async () => {
    const saleId = sellTwo();
    payCash(saleId, 3000);

    await voidIt(saleId);

    expect(database.prepare("SELECT satisfied_at, cancelled_at FROM deferred_sales").all()).toEqual(
      [{ satisfied_at: null, cancelled_at: VOIDED_AT.toISOString() }],
    );
  });

  it("appends the sale_voided event to the outbox", async () => {
    const saleId = sellTwo();
    payCash(saleId, 3000);
    const before = database.prepare("SELECT count(*) AS total FROM outbox").get();

    await voidIt(saleId);

    expect(
      database
        .prepare("SELECT event_type, aggregate_id FROM outbox WHERE event_type = 'sale_voided'")
        .all(),
    ).toEqual([{ event_type: "sale_voided", aggregate_id: saleId }]);
    expect(database.prepare("SELECT count(*) AS total FROM outbox").get()).toEqual({
      total: (before as { total: number }).total + 1,
    });
  });

  it("refuses to void it twice", async () => {
    const saleId = sellTwo();
    payCash(saleId, 3000);
    await voidIt(saleId);

    await expect(voidIt(saleId)).resolves.toEqual({ kind: "not_completed" });
  });

  it("leaves nothing behind when the outbox append fails after the rest was written", async () => {
    const saleId = sellTwo();
    payCash(saleId, 3000);
    database.exec(
      `CREATE TRIGGER refuse_voided_events BEFORE INSERT ON outbox
       WHEN NEW.event_type = 'sale_voided'
       BEGIN SELECT RAISE(ABORT, 'outbox refused'); END`,
    );

    await expect(voidIt(saleId)).rejects.toThrow("outbox refused");

    expect(database.prepare("SELECT state, voided_at FROM sales").all()).toEqual([
      { state: "COMPLETED", voided_at: null },
    ]);
    expect(database.prepare("SELECT count(*) AS total FROM payment_refunds").get()).toEqual({
      total: 0,
    });
    expect(
      database.prepare("SELECT count(*) AS total FROM cash_movements WHERE type = 'REFUND'").get(),
    ).toEqual({ total: 0 });
    expect(
      database
        .prepare("SELECT count(*) AS total FROM stock_movements WHERE kind = 'sale_void'")
        .get(),
    ).toEqual({ total: 0 });
    expect(database.prepare("SELECT cancelled_at FROM deferred_sales").all()).toEqual([
      { cancelled_at: null },
    ]);
  });

  it("is unavailable while the register holds no outbox chain key", async () => {
    const saleId = sellTwo();
    payCash(saleId, 3000);

    const outcome = await voidSale(
      {
        ledger: voidLedger(null),
        clock: { now: () => VOIDED_AT },
        ids,
        authority: {
          authorize: async () => ({
            kind: "granted",
            grant: { actorId: "u1", authorizedBy: undefined },
          }),
        },
      },
      { saleId, pendingRefundsConfirmed: false },
    );

    expect(outcome).toEqual({ kind: "unavailable" });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "COMPLETED" }]);
  });

  it("refuses to record the voiding of a sale that is not completed", () => {
    const saleId = sellTwo();

    expect(() =>
      voidLedger().transaction((tx) => tx.recordVoidedSale(saleId, VOIDED_AT, undefined)),
    ).toThrow();
    expect(() =>
      voidLedger().transaction((tx) => tx.recordVoidedSale("missing", VOIDED_AT, undefined)),
    ).toThrow();
  });

  it("refuses to cancel the deferred record of a sale that has none", () => {
    const saleId = sellTwo();

    expect(() =>
      voidLedger().transaction((tx) => tx.cancelDeferredSale(saleId, VOIDED_AT)),
    ).toThrow();
  });
});
