import { encodePinHash } from "@purosur/contracts";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { derivePinVerifier } from "../credentials/pin-verifier";
import {
  insertFiscalDocument,
  insertHealthCheck,
  insertOfflineFiscalDocument,
  insertOfflinePointOfSale,
  insertPointOfSale,
} from "../fiscal/test-support/real-time-authorization-database";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { createActionGate } from "../sessions/action-gate";
import { createSignedInPerson, type SignedInPerson } from "../sessions/signed-in-person";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import {
  chargeSaleByTransferFor,
  chargeSaleInCashFor,
  type OutboxSaleRequestDeps,
  type SellingRequestDeps,
  scanProductFor,
} from "./sale-requests";
import { type VoidSaleRequest, voidSaleFor } from "./void-sale-requests";

const NOW = new Date("2026-09-30T12:00:00.000Z");
const VOIDED_AT = new Date("2026-09-30T12:30:00.000Z");
const PEPPER = Buffer.alloc(32, 7).toString("base64url");
const PIN_HASH = "argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaC1vZi10aGUtcGlu";
const SUPERVISOR_PIN = "1234";
const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

let database: LocalDatabase;
let signedInPerson: SignedInPerson;
let idCount: number;

function gate() {
  return createActionGate({
    store: new SqliteSignInStore(database),
    signedInPerson,
    readPepper: async () => PEPPER,
    hashPin: async (pin) => (pin === SUPERVISOR_PIN ? PIN_HASH : "hash-of-another-pin"),
    now: () => NOW,
  });
}

function deps(
  overrides: Partial<OutboxSaleRequestDeps & SellingRequestDeps> = {},
): OutboxSaleRequestDeps & SellingRequestDeps {
  return {
    database,
    gate: gate(),
    readOutboxChainKey: async () => CHAIN_KEY,
    now: () => NOW,
    ids: {
      next: () => {
        idCount += 1;
        return `id-${idCount}`;
      },
    },
    paidOrderDiscovery: () => "checked",
    newSalesStoppedByDisk: () => false,
    localDatabaseDamaged: () => false,
    newSalesStoppedByBattery: () => false,
    ...overrides,
  };
}

function voidDeps(overrides: Partial<OutboxSaleRequestDeps> = {}): OutboxSaleRequestDeps {
  return deps({ now: () => VOIDED_AT, ...overrides });
}

function addPerson(id: string, firstName: string, permissions: string[]): void {
  database
    .prepare(
      `INSERT INTO roles (id, name, is_administrator, version) VALUES ('role-${id}', 'Rol', 0, 1)`,
    )
    .run();
  for (const key of permissions) {
    database
      .prepare(
        `INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('role-${id}', ?, 1)`,
      )
      .run(key);
  }
  database
    .prepare(
      "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES (?, ?, ?, ?, 1, 1)",
    )
    .run(id, firstName, `role-${id}`, encodePinHash(new Uint8Array(16).fill(1)));
  database
    .prepare("INSERT INTO pin_verifiers (user_id, verifier) VALUES (?, ?)")
    .run(id, derivePinVerifier(PEPPER, PIN_HASH));
}

async function sellTwo(): Promise<string> {
  await scanProductFor(deps(), "111");
  const outcome = await scanProductFor(deps(), "111");
  if (outcome.kind !== "added") {
    throw new Error("test setup: the product was not added");
  }
  return outcome.sale.id;
}

async function soldInCash(): Promise<string> {
  const saleId = await sellTwo();
  await chargeSaleInCashFor(deps(), { saleId, tendered: 3000 });
  return saleId;
}

function request(saleId: string, overrides: Partial<VoidSaleRequest> = {}): VoidSaleRequest {
  return { saleId, pendingRefundsConfirmed: false, ...overrides };
}

function saleStates(): unknown[] {
  return database.prepare("SELECT state FROM sales").all();
}

beforeEach(() => {
  idCount = 0;
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    `INSERT INTO roles (id, name, is_administrator, version) VALUES ('cashier', 'Cajera', 0, 1);
     INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('cashier', 'sell_and_charge', 1);
     INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES ('u1', 'Ada', 'cashier', 's', 1, 1);
     INSERT INTO own_register (id, name, version) VALUES ('register-1', 'Caja 1', 1);
     UPDATE sync_state SET device_id = 'device-1';
     INSERT INTO buyer_identification_thresholds (id, amount, valid_from, revision)
     VALUES ('threshold-1', 100000000, '2026-01-01', 0);
     INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
     VALUES ('session-1', 'register-1', 'device-1', 'u1', '2026-09-30T08:00:00.000Z', 0, 'OPEN');
     INSERT INTO products (id, name, category_id, sale_unit, active, version) VALUES ('p1', 'Yerba', 'c', 'UNIT', 1, 1);
     INSERT INTO product_barcodes (product_id, position, code, active) VALUES ('p1', 1, '111', 1);
     INSERT INTO prices (id, product_id, price_list_id, unit_price, valid_from, version)
     VALUES ('price-1', 'p1', 'list-1', 1500, '2026-09-01T00:00:00.000Z', 1);`,
  );
  addPerson("u2", "Grace", ["void_sale"]);
  signedInPerson = createSignedInPerson();
  signedInPerson.set("u1");
});

afterEach(() => {
  database.close();
});

describe("voiding a sale of the sales history", () => {
  it("voids it for a person who holds the permission, giving the cash back to the customer", async () => {
    addPerson("u3", "Linus", ["sell_and_charge", "void_sale"]);
    database.exec("UPDATE cash_sessions SET opened_by = 'u3'");
    signedInPerson.set("u3");
    const saleId = await soldInCash();
    const paymentId = database
      .prepare<[], { id: string }>("SELECT id FROM payment_transactions")
      .get()?.id;

    const outcome = await voidSaleFor(voidDeps(), request(saleId));

    expect(outcome).toEqual({
      kind: "voided",
      refunds: [{ payment_id: paymentId, method: "CASH", amount: 3000, state: "APPROVED" }],
      authorized_by: null,
    });
    expect(
      database.prepare("SELECT state, voided_at, void_authorized_by FROM sales").all(),
    ).toEqual([{ state: "VOIDED", voided_at: VOIDED_AT.toISOString(), void_authorized_by: null }]);
    expect(
      database
        .prepare("SELECT amount, actor_id, authorized_by FROM cash_movements WHERE type = 'REFUND'")
        .all(),
    ).toEqual([{ amount: 3000, actor_id: "u3", authorized_by: null }]);
  });

  it("puts the merchandise back and cancels the pending record of a sale that fell back to a non-fiscal document", async () => {
    addPerson("u3", "Linus", ["sell_and_charge", "void_sale"]);
    database.exec("UPDATE cash_sessions SET opened_by = 'u3'");
    signedInPerson.set("u3");
    const saleId = await soldInCash();

    await voidSaleFor(voidDeps(), request(saleId));

    expect(database.prepare("SELECT quantity FROM stock_balances").all()).toEqual([
      { quantity: 0 },
    ]);
    expect(database.prepare("SELECT cancelled_at FROM deferred_sales").all()).toEqual([
      { cancelled_at: VOIDED_AT.toISOString() },
    ]);
  });

  it("voids in full a sale deferred because the register's clock reads behind its mark", async () => {
    addPerson("u3", "Linus", ["sell_and_charge", "void_sale"]);
    database.exec("UPDATE cash_sessions SET opened_by = 'u3'");
    signedInPerson.set("u3");
    insertHealthCheck(database, { checkedAt: "2026-09-30T11:59:58.000Z" });
    insertPointOfSale(database, 40);
    database
      .prepare(
        `INSERT INTO issuer_identification_versions (
           version, legal_name, gross_income_registration, activity_start_date, authorized_cuit, tax_status
         ) VALUES (1, ?, ?, '2020-01-15', ?, 'Monotributo')`,
      )
      .run(FICTIONAL_LEGAL_NAME, FICTIONAL_GROSS_INCOME_REGISTRATION, FICTIONAL_CUIT);
    database
      .prepare(
        "INSERT INTO buyer_tax_status_sets (params_version, set_id, options) VALUES (1, 'set-1', ?)",
      )
      .run(JSON.stringify([{ code: 5, description: "Consumidor Final", invoice_class: "A/M/C" }]));
    database.exec(
      `INSERT INTO register_clock_marks (point_of_sale, document_type, reading)
       VALUES (12, 'factura_c', '2026-09-30T12:10:00.000Z')`,
    );
    const saleId = await soldInCash();
    expect(database.prepare("SELECT reason FROM deferred_sales").all()).toEqual([
      { reason: "clock_behind" },
    ]);

    const outcome = await voidSaleFor(voidDeps(), request(saleId));

    expect(outcome).toMatchObject({ kind: "voided" });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "VOIDED" }]);
    expect(database.prepare("SELECT quantity FROM stock_balances").all()).toEqual([
      { quantity: 0 },
    ]);
    expect(database.prepare("SELECT cancelled_at FROM deferred_sales").all()).toEqual([
      { cancelled_at: VOIDED_AT.toISOString() },
    ]);
    expect(
      database.prepare("SELECT amount FROM cash_movements WHERE type = 'REFUND'").all(),
    ).toEqual([{ amount: 3000 }]);
  });

  it("tells the cloud, naming who authorized, with the PIN of a person who holds the permission", async () => {
    const saleId = await soldInCash();

    const outcome = await voidSaleFor(
      voidDeps(),
      request(saleId, { authorization: { user_id: "u2", pin: SUPERVISOR_PIN } }),
    );

    expect(outcome).toMatchObject({
      kind: "voided",
      authorized_by: { user_id: "u2", first_name: "Grace" },
    });
    expect(database.prepare("SELECT void_authorized_by FROM sales").all()).toEqual([
      { void_authorized_by: "u2" },
    ]);
    expect(
      database
        .prepare("SELECT actor_id, authorized_by FROM cash_movements WHERE type = 'REFUND'")
        .all(),
    ).toEqual([{ actor_id: "u1", authorized_by: "u2" }]);
    expect(
      database
        .prepare<[], { payload: string }>(
          "SELECT payload FROM outbox WHERE event_type = 'sale_voided'",
        )
        .all()
        .map(({ payload }) => (JSON.parse(payload) as { authorized_by: string }).authorized_by),
    ).toEqual(["u2"]);
  });

  it("refuses a cashier without the permission who brings no authorization, changing nothing", async () => {
    const saleId = await soldInCash();

    expect(await voidSaleFor(voidDeps(), request(saleId))).toEqual({ kind: "lacks_permission" });
    expect(saleStates()).toEqual([{ state: "COMPLETED" }]);
  });

  it("refuses a wrong PIN, changing nothing", async () => {
    const saleId = await soldInCash();

    const outcome = await voidSaleFor(
      voidDeps(),
      request(saleId, { authorization: { user_id: "u2", pin: "0000" } }),
    );

    expect(outcome.kind).toBe("wrong_pin");
    expect(saleStates()).toEqual([{ state: "COMPLETED" }]);
  });

  it("refuses the PIN of a person who lacks the permission, changing nothing", async () => {
    addPerson("u4", "Alan", ["sell_and_charge"]);
    const saleId = await soldInCash();

    expect(
      await voidSaleFor(
        voidDeps(),
        request(saleId, { authorization: { user_id: "u4", pin: SUPERVISOR_PIN } }),
      ),
    ).toEqual({ kind: "lacks_permission" });
    expect(saleStates()).toEqual([{ state: "COMPLETED" }]);
  });

  it("answers not_signed_in when nobody is signed in", async () => {
    const saleId = await soldInCash();
    signedInPerson.clear();

    expect(await voidSaleFor(voidDeps(), request(saleId))).toEqual({ kind: "not_signed_in" });
  });

  describe("with the supervisor's PIN", () => {
    const authorization = { user_id: "u2", pin: SUPERVISOR_PIN };

    it("answers not_found for a sale the register does not hold", async () => {
      expect(await voidSaleFor(voidDeps(), request("missing", { authorization }))).toEqual({
        kind: "not_found",
      });
    });

    it("refuses a sale whose session closed, changing nothing", async () => {
      const saleId = await soldInCash();
      database.exec(
        "UPDATE cash_sessions SET state = 'CLOSED', closed_at = '2026-09-30T20:00:00.000Z'",
      );

      expect(await voidSaleFor(voidDeps(), request(saleId, { authorization }))).toEqual({
        kind: "session_closed",
      });
      expect(saleStates()).toEqual([{ state: "COMPLETED" }]);
      expect(database.prepare("SELECT count(*) AS total FROM payment_refunds").get()).toEqual({
        total: 0,
      });
    });

    it.each(["REQUESTING", "UNKNOWN"] as const)(
      "refuses a sale whose invoice request is %s, changing nothing",
      async (state) => {
        const saleId = await soldInCash();
        database.exec("DELETE FROM deferred_sales");
        insertFiscalDocument(database, { saleId, state });

        expect(await voidSaleFor(voidDeps(), request(saleId, { authorization }))).toEqual({
          kind: "invoice_in_flight",
        });
        expect(saleStates()).toEqual([{ state: "COMPLETED" }]);
      },
    );

    it("refuses a sale that carries an authorized invoice, changing nothing", async () => {
      const saleId = await soldInCash();
      database.exec("DELETE FROM deferred_sales");
      insertFiscalDocument(database, { saleId, state: "AUTHORIZED" });

      expect(await voidSaleFor(voidDeps(), request(saleId, { authorization }))).toEqual({
        kind: "carries_invoice",
      });
      expect(saleStates()).toEqual([{ state: "COMPLETED" }]);
    });

    it("refuses a sale that carries a contingency document, changing nothing", async () => {
      const saleId = await soldInCash();
      insertOfflinePointOfSale(database);
      insertOfflineFiscalDocument(database, { saleId });

      expect(await voidSaleFor(voidDeps(), request(saleId, { authorization }))).toEqual({
        kind: "carries_invoice",
      });
      expect(saleStates()).toEqual([{ state: "COMPLETED" }]);
    });

    describe.each([
      ["QR", "MERCADOPAGO_QR"],
      ["POINT", "MERCADOPAGO_POINT"],
    ])("a sale with an approved Mercado Pago %s payment", (method, provider) => {
      async function soldInCashAndThrough(): Promise<string> {
        const saleId = await soldInCash();
        database
          .prepare(
            `INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, state, occurred_at, wait_ends_at)
             VALUES ('mp-1', ?, 'SALE', ?, ?, 500, 'APPROVED', ?, ?)`,
          )
          .run(saleId, method, provider, NOW.toISOString(), NOW.toISOString());
        return saleId;
      }

      it("asks the pending refund to be confirmed before voiding, changing nothing", async () => {
        const saleId = await soldInCashAndThrough();

        expect(await voidSaleFor(voidDeps(), request(saleId, { authorization }))).toEqual({
          kind: "pending_refunds_unconfirmed",
        });
        expect(saleStates()).toEqual([{ state: "COMPLETED" }]);
        expect(database.prepare("SELECT id FROM payment_refunds").all()).toEqual([]);
      });

      it("voids it once confirmed, refunding the cash on the spot and leaving the Mercado Pago refund pending", async () => {
        const saleId = await soldInCashAndThrough();

        const outcome = await voidSaleFor(
          voidDeps(),
          request(saleId, { authorization, pendingRefundsConfirmed: true }),
        );

        expect(outcome).toMatchObject({
          kind: "voided",
          refunds: [
            { method: "CASH", state: "APPROVED" },
            { method, amount: 500, state: "PENDING" },
          ],
        });
        expect(saleStates()).toEqual([{ state: "VOIDED" }]);
        expect(
          database
            .prepare(
              "SELECT payment_id, method, provider, state FROM payment_refunds ORDER BY method",
            )
            .all(),
        ).toEqual(
          expect.arrayContaining([{ payment_id: "mp-1", method, provider, state: "PENDING" }]),
        );
      });
    });

    it("asks the pending refunds to be confirmed before voiding a sale paid by transfer", async () => {
      const saleId = await sellTwo();
      await chargeSaleByTransferFor(deps(), { saleId, amount: 3000 });

      expect(await voidSaleFor(voidDeps(), request(saleId, { authorization }))).toEqual({
        kind: "pending_refunds_unconfirmed",
      });
      expect(saleStates()).toEqual([{ state: "COMPLETED" }]);
    });

    it("voids a sale paid by transfer once the pending refund is confirmed, leaving it pending", async () => {
      const saleId = await sellTwo();
      await chargeSaleByTransferFor(deps(), { saleId, amount: 3000 });

      const outcome = await voidSaleFor(
        voidDeps(),
        request(saleId, { authorization, pendingRefundsConfirmed: true }),
      );

      expect(outcome).toMatchObject({
        kind: "voided",
        refunds: [{ method: "TRANSFER", amount: 3000, state: "PENDING" }],
      });
      expect(database.prepare("SELECT method, state FROM payment_refunds").all()).toEqual([
        { method: "TRANSFER", state: "PENDING" },
      ]);
      expect(
        database
          .prepare("SELECT count(*) AS total FROM cash_movements WHERE type = 'REFUND'")
          .get(),
      ).toEqual({ total: 0 });
    });

    it("answers unavailable, changing nothing, while the register holds no outbox chain key", async () => {
      const saleId = await soldInCash();

      expect(
        await voidSaleFor(
          voidDeps({ readOutboxChainKey: async () => undefined }),
          request(saleId, { authorization }),
        ),
      ).toEqual({ kind: "unavailable" });
      expect(saleStates()).toEqual([{ state: "COMPLETED" }]);
    });

    it("refuses to void it twice", async () => {
      const saleId = await soldInCash();
      await voidSaleFor(voidDeps(), request(saleId, { authorization }));

      expect(await voidSaleFor(voidDeps(), request(saleId, { authorization }))).toEqual({
        kind: "not_completed",
      });
    });
  });
});
