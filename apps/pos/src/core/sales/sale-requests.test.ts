import { encodePinHash } from "@purosur/contracts";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createActionGate } from "../access/action-gate";
import { derivePinVerifier } from "../access/pin-verifier";
import { createSignedInPerson, type SignedInPerson } from "../access/signed-in-person";
import { SqliteSignInStore } from "../access/sqlite-sign-in-store";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { cashBalanceFor } from "../register/cash-session-requests";
import {
  addSearchedProductFor,
  cancelLockedSaleFor,
  cancelPaidSaleFor,
  cancelSaleFor,
  cashChargeFor,
  changeLineQuantityFor,
  chargeSaleByTransferFor,
  chargeSaleInCashFor,
  currentSaleFor,
  type OutboxSaleRequestDeps,
  removeSaleLineFor,
  scanProductFor,
  searchProductsFor,
} from "./sale-requests";

const NOW = new Date("2026-09-30T12:00:00.000Z");

const PEPPER = Buffer.alloc(32, 7).toString("base64url");
const PIN_HASH = "argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaC1vZi10aGUtcGlu";
const CLOSER_PIN = "1234";
const CLOSER = { user_id: "u9", pin: CLOSER_PIN };

const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

let database: LocalDatabase;
let signedInPerson: SignedInPerson;

function deps(overrides: Partial<OutboxSaleRequestDeps> = {}): OutboxSaleRequestDeps {
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
    ...overrides,
  };
}

function idsStartingWith(prefix: string): OutboxSaleRequestDeps["ids"] {
  let count = 0;
  return {
    next: () => {
      count += 1;
      return `${prefix}-${count}`;
    },
  };
}

function addPerson(id: string, roleId: string): void {
  database
    .prepare(
      "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES (?, 'Ana', ?, 's', 1, 1)",
    )
    .run(id, roleId);
}

function saveThreshold(amount: number, validFrom = "2026-01-01"): void {
  database
    .prepare(
      "INSERT INTO buyer_identification_thresholds (id, amount, valid_from) VALUES (?, ?, ?)",
    )
    .run(`threshold-starting-${validFrom}`, amount, validFrom);
}

function addFiscalConfiguration(): void {
  database
    .prepare(
      `INSERT INTO issuer_identification_versions (
         version, legal_name, gross_income_registration, activity_start_date, authorized_cuit, tax_status
       ) VALUES (1, ?, ?, '2020-01-15', ?, 'Condicion de prueba')`,
    )
    .run(FICTIONAL_LEGAL_NAME, FICTIONAL_GROSS_INCOME_REGISTRATION, FICTIONAL_CUIT);
  database
    .prepare(
      "INSERT INTO buyer_tax_status_sets (params_version, set_id, options) VALUES (1, 'set-1', ?)",
    )
    .run(JSON.stringify([{ code: 5, description: "Consumidor Final", invoice_class: "A/M/C" }]));
}

function seed(): void {
  database
    .prepare(
      "INSERT INTO roles (id, name, is_administrator, version) VALUES ('guest', 'Invitada', 0, 1)",
    )
    .run();
  database
    .prepare(
      "INSERT INTO roles (id, name, is_administrator, version) VALUES ('cashier', 'Cajera', 0, 1)",
    )
    .run();
  database
    .prepare(
      "INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('cashier', 'sell_and_charge', 1)",
    )
    .run();
  database
    .prepare(
      "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES ('u1', 'Ada', 'cashier', 's', 1, 1)",
    )
    .run();
  database
    .prepare("INSERT INTO own_register (id, name, version) VALUES ('register-1', 'Caja 1', 1)")
    .run();
  database.prepare("UPDATE sync_state SET device_id = 'device-1'").run();
  saveThreshold(100_000_000);
  database
    .prepare(
      `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
       VALUES ('session-1', 'register-1', 'device-1', 'u1', '2026-09-30T08:00:00.000Z', 0, 'OPEN')`,
    )
    .run();
  database
    .prepare(
      "INSERT INTO products (id, name, category_id, sale_unit, active, version) VALUES ('p1', 'Yerba', 'c', 'UNIT', 1, 1)",
    )
    .run();
  database
    .prepare(
      "INSERT INTO product_barcodes (product_id, position, code, active) VALUES ('p1', 1, '111', 1)",
    )
    .run();
  database
    .prepare(
      "INSERT INTO products (id, name, category_id, sale_unit, active, version) VALUES ('p2', 'Queso', 'c', 'KG', 1, 1)",
    )
    .run();
  database
    .prepare(
      "INSERT INTO product_barcodes (product_id, position, code, active) VALUES ('p2', 1, '222', 1)",
    )
    .run();
  database
    .prepare(
      `INSERT INTO prices (id, product_id, price_list_id, unit_price, valid_from, version)
       VALUES ('price-1', 'p1', 'list-1', 1500, '2026-09-01T00:00:00.000Z', 1)`,
    )
    .run();
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

describe("scanning a product on the register", () => {
  it("answers the sale with each line as the screen shows it and the total to charge", async () => {
    await scanProductFor(deps(), "111");

    expect(await scanProductFor(deps(), "111")).toEqual({
      kind: "added",
      sale: {
        id: "id-1",
        lines: [
          {
            id: "id-2",
            product_id: "p1",
            product_name: "Yerba",
            quantity: 2,
            list_unit_price: 1500,
            discount_amount: 0,
            promotion: null,
            line_total: 3000,
          },
        ],
        total: 3000,
        paid: 0,
        pending: 3000,
        lines_editable: true,
        cancellable: true,
        charge_refusal: null,
        refunds_on_cancel: [],
        cancel_authorization_required: true,
      },
    });
  });

  it.each([
    [
      "a percent",
      { kind: "PERCENT_OFF", percent: 10, buy_qty: null, pay_qty: null },
      1,
      { kind: "PERCENT_OFF", percent: 10 },
      { discount_amount: 150, line_total: 1350 },
    ],
    [
      "a buy N pay M",
      { kind: "BUY_N_PAY_M", percent: null, buy_qty: 3, pay_qty: 2 },
      3,
      { kind: "BUY_N_PAY_M", buy_qty: 3, pay_qty: 2 },
      { discount_amount: 1500, line_total: 3000 },
    ],
  ])(
    "answers the promotion a line was charged with: %s",
    async (_case, columns, scans, promotion, charged) => {
      database
        .prepare(
          `INSERT INTO discounts (
           id, name, kind, percent, buy_qty, pay_qty, target_kind, target_id, valid_from, valid_to,
           weekdays, active, version
         ) VALUES ('d1', 'Promo', @kind, @percent, @buy_qty, @pay_qty, 'PRODUCT', 'p1', '2026-09-01', '2026-12-31', '[]', 1, 1)`,
        )
        .run(columns);

      let outcome = await scanProductFor(deps(), "111");
      for (let scan = 1; scan < scans; scan += 1) {
        outcome = await scanProductFor(deps(), "111");
      }

      expect(outcome.kind === "added" && outcome.sale.lines[0]).toMatchObject({
        promotion,
        ...charged,
      });
    },
  );

  it("answers the name of a product that has no price", async () => {
    database.prepare("DELETE FROM prices").run();

    expect(await scanProductFor(deps(), "111")).toEqual({
      kind: "no_price",
      product_name: "Yerba",
    });
  });

  it("answers the name of a product sold by weight", async () => {
    expect(await scanProductFor(deps(), "222")).toEqual({
      kind: "sold_by_weight",
      product_name: "Queso",
    });
  });

  it("answers the domain's refusal of a code no product holds", async () => {
    expect(await scanProductFor(deps(), "999")).toEqual({ kind: "unknown_code" });
  });

  it("answers not signed in when nobody is signed in", async () => {
    signedInPerson.clear();

    expect(await scanProductFor(deps(), "111")).toEqual({ kind: "not_signed_in" });
  });

  it("answers not permitted to a signed-in person without the permission to sell", async () => {
    addPerson("u2", "guest");
    signedInPerson.set("u2");

    expect(await scanProductFor(deps(), "111")).toEqual({ kind: "not_permitted" });
  });

  it("answers that no session is open", async () => {
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await scanProductFor(deps(), "111")).toEqual({ kind: "no_open_session" });
  });

  it("answers that the installation was revoked when no sale was started", async () => {
    database
      .prepare("UPDATE sync_state SET installation_revoked_at = '2026-09-30T11:00:00.000Z'")
      .run();

    expect(await scanProductFor(deps(), "111")).toEqual({ kind: "installation_revoked" });
  });

  it("answers unavailable when the register does not know its own identity yet", async () => {
    database.prepare("DELETE FROM own_register").run();

    expect(await scanProductFor(deps(), "111")).toEqual({ kind: "unavailable" });
  });
});

describe("searching products by name on the register", () => {
  it("answers each product the way the screen shows it, with its price and where the name matched", async () => {
    expect(await searchProductsFor(deps(), "yer")).toEqual({
      kind: "results",
      products: [
        {
          product_id: "p1",
          name: "Yerba",
          sale_unit: "UNIT",
          unit_price: 1500,
          matches: [{ start: 0, length: 3 }],
        },
      ],
      more: false,
    });
  });

  it("answers no price for a product that has none", async () => {
    const outcome = await searchProductsFor(deps(), "queso");

    expect(outcome.kind === "results" && outcome.products).toEqual([
      expect.objectContaining({ product_id: "p2", sale_unit: "KG", unit_price: null }),
    ]);
  });

  it("answers not signed in when nobody is signed in", async () => {
    signedInPerson.clear();

    expect(await searchProductsFor(deps(), "yer")).toEqual({ kind: "not_signed_in" });
  });

  it("answers not permitted to a signed-in person without the permission to sell", async () => {
    addPerson("u2", "guest");
    signedInPerson.set("u2");

    expect(await searchProductsFor(deps(), "yer")).toEqual({ kind: "not_permitted" });
  });

  it("answers that no session is open", async () => {
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await searchProductsFor(deps(), "yer")).toEqual({ kind: "no_open_session" });
  });
});

describe("adding a searched product on the register", () => {
  it("answers the sale with the product as a line and the total to charge", async () => {
    expect(await addSearchedProductFor(deps(), "p1")).toEqual({
      kind: "added",
      sale: {
        id: "id-1",
        lines: [
          {
            id: "id-2",
            product_id: "p1",
            product_name: "Yerba",
            quantity: 1,
            list_unit_price: 1500,
            discount_amount: 0,
            promotion: null,
            line_total: 1500,
          },
        ],
        total: 1500,
        paid: 0,
        pending: 1500,
        lines_editable: true,
        cancellable: true,
        charge_refusal: null,
        refunds_on_cancel: [],
        cancel_authorization_required: true,
      },
    });
  });

  it("answers the name of a product that has no price or is sold by weight", async () => {
    database.prepare("DELETE FROM prices").run();

    expect(await addSearchedProductFor(deps(), "p1")).toEqual({
      kind: "no_price",
      product_name: "Yerba",
    });
    expect(await addSearchedProductFor(deps(), "p2")).toEqual({
      kind: "sold_by_weight",
      product_name: "Queso",
    });
  });

  it("answers that a product that is not sold any more is unavailable", async () => {
    database.prepare("UPDATE products SET active = 0 WHERE id = 'p1'").run();

    expect(await addSearchedProductFor(deps(), "p1")).toEqual({ kind: "product_unavailable" });
  });

  it("answers not signed in when nobody is signed in", async () => {
    signedInPerson.clear();

    expect(await addSearchedProductFor(deps(), "p1")).toEqual({ kind: "not_signed_in" });
  });

  it("answers not permitted to a signed-in person without the permission to sell", async () => {
    addPerson("u2", "guest");
    signedInPerson.set("u2");

    expect(await addSearchedProductFor(deps(), "p1")).toEqual({ kind: "not_permitted" });
  });

  it("answers the refusal of a session that is not open", async () => {
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await addSearchedProductFor(deps(), "p1")).toEqual({ kind: "no_open_session" });
  });
});

describe("the sale in progress", () => {
  it("is none before anything was scanned", async () => {
    expect(await currentSaleFor(deps())).toBeNull();
  });

  it("is none when nobody is signed in", async () => {
    await scanProductFor(deps(), "111");
    signedInPerson.clear();

    expect(await currentSaleFor(deps())).toBeNull();
  });

  it("answers not permitted to a signed-in person without the permission to sell", async () => {
    await scanProductFor(deps(), "111");
    addPerson("u2", "guest");
    signedInPerson.set("u2");

    expect(await currentSaleFor(deps())).toBe("not_permitted");
  });

  it("answers the domain's refusal of a person who sells but did not open the session", async () => {
    await scanProductFor(deps(), "111");
    addPerson("u3", "cashier");
    signedInPerson.set("u3");

    expect(await currentSaleFor(deps())).toBe("not_permitted");
  });

  it("is the sale with its lines and the total to charge", async () => {
    await scanProductFor(deps(), "111");
    await scanProductFor(deps(), "111");

    expect(await currentSaleFor(deps())).toEqual({
      id: "id-1",
      lines: [
        {
          id: "id-2",
          product_id: "p1",
          product_name: "Yerba",
          quantity: 2,
          list_unit_price: 1500,
          discount_amount: 0,
          promotion: null,
          line_total: 3000,
        },
      ],
      total: 3000,
      paid: 0,
      pending: 3000,
      lines_editable: true,
      cancellable: true,
      charge_refusal: null,
      refunds_on_cancel: [],
      cancel_authorization_required: true,
    });
  });

  it("reports what was paid, what is pending and that the lines are frozen once a payment is approved", async () => {
    const saleId = await sellTwoForPayments();
    await chargeSaleInCashFor(deps(), { saleId, tendered: 1000 });

    expect(await currentSaleFor(deps())).toMatchObject({
      total: 3000,
      paid: 1000,
      pending: 2000,
      lines_editable: false,
      cancellable: false,
    });
  });

  it("lists the refund each approved payment would get if the sale were cancelled", async () => {
    const saleId = await sellTwoForPayments();
    const ids = idsStartingWith("payment");
    await chargeSaleInCashFor(deps({ ids }), { saleId, tendered: 1000 });
    await chargeSaleByTransferFor(deps({ ids }), { saleId, amount: 500 });
    const paymentIds = database
      .prepare<[], { id: string }>("SELECT id FROM payment_transactions ORDER BY rowid")
      .all()
      .map((payment) => payment.id);

    expect(await currentSaleFor(deps())).toMatchObject({
      refunds_on_cancel: [
        { payment_id: paymentIds[0], method: "CASH", amount: 1000, state: "APPROVED" },
        { payment_id: paymentIds[1], method: "TRANSFER", amount: 500, state: "PENDING" },
      ],
    });
  });

  it("says that cancelling it needs another person's authorization to a person without the void sale permission", async () => {
    await scanProductFor(deps(), "111");

    expect(await currentSaleFor(deps())).toMatchObject({ cancel_authorization_required: true });
  });

  it("says that cancelling it needs nobody's authorization to a person with the void sale permission", async () => {
    database
      .prepare(
        "INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('cashier', 'void_sale', 1)",
      )
      .run();
    await scanProductFor(deps(), "111");

    expect(await currentSaleFor(deps())).toMatchObject({ cancel_authorization_required: false });
  });

  it("is refused for charging when the total reaches the threshold in effect", async () => {
    saveThreshold(3000, "2026-09-30");
    await scanProductFor(deps(), "111");
    await scanProductFor(deps(), "111");

    expect(await currentSaleFor(deps())).toMatchObject({
      total: 3000,
      charge_refusal: { kind: "reaches_buyer_identification_threshold", threshold: 3000 },
    });
  });

  it("is refused for charging when the register holds no threshold", async () => {
    database.prepare("DELETE FROM buyer_identification_thresholds").run();
    await scanProductFor(deps(), "111");

    expect(await currentSaleFor(deps())).toMatchObject({
      charge_refusal: { kind: "no_buyer_identification_threshold" },
    });
  });
});

async function sellTwoForPayments(): Promise<string> {
  await scanProductFor(deps(), "111");
  const outcome = await scanProductFor(deps(), "111");
  if (outcome.kind !== "added") {
    throw new Error("test setup: the product was not added");
  }
  return outcome.sale.id;
}

async function sellTwoYerbas(): Promise<string> {
  await scanProductFor(deps(), "111");
  await scanProductFor(deps(), "111");
  return "id-2";
}

describe("changing the quantity of a line", () => {
  it("answers the sale with the new quantity and total", async () => {
    const lineId = await sellTwoYerbas();

    const outcome = await changeLineQuantityFor(deps(), lineId, 1, 2);

    expect(outcome).toMatchObject({
      kind: "changed",
      sale: { lines: [{ id: lineId, quantity: 1, line_total: 1500 }], total: 1500 },
    });
  });

  it("answers that the line changed, writing nothing, when the screen showed another quantity", async () => {
    const lineId = await sellTwoYerbas();

    expect(await changeLineQuantityFor(deps(), lineId, 1, 5)).toEqual({ kind: "stale_quantity" });
    expect(database.prepare("SELECT quantity FROM sale_lines").all()).toEqual([{ quantity: 2 }]);
  });

  it.each([
    ["a line the sale does not have", "other-line", 1, { kind: "unknown_line" }],
    ["a quantity of zero", "id-2", 0, { kind: "invalid_quantity" }],
  ])("answers the domain's refusal of %s", async (_case, lineId, quantity, expected) => {
    await sellTwoYerbas();

    expect(await changeLineQuantityFor(deps(), lineId, quantity, 2)).toEqual(expected);
  });

  it("answers that there is no sale to change", async () => {
    expect(await changeLineQuantityFor(deps(), "id-2", 1, 2)).toEqual({ kind: "no_open_sale" });
  });

  it("answers not signed in when nobody is signed in", async () => {
    const lineId = await sellTwoYerbas();
    signedInPerson.clear();

    expect(await changeLineQuantityFor(deps(), lineId, 1, 2)).toEqual({ kind: "not_signed_in" });
  });

  it("answers not permitted to a person who sells but did not open the session", async () => {
    const lineId = await sellTwoYerbas();
    addPerson("u3", "cashier");
    signedInPerson.set("u3");

    expect(await changeLineQuantityFor(deps(), lineId, 1, 2)).toEqual({ kind: "not_permitted" });
  });

  it("answers not permitted to a person without the permission to sell", async () => {
    const lineId = await sellTwoYerbas();
    addPerson("u2", "guest");
    signedInPerson.set("u2");

    expect(await changeLineQuantityFor(deps(), lineId, 1, 2)).toEqual({ kind: "not_permitted" });
  });

  it("answers that no session is open", async () => {
    const lineId = await sellTwoYerbas();
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await changeLineQuantityFor(deps(), lineId, 1, 2)).toEqual({ kind: "no_open_session" });
  });
});

describe("removing a line", () => {
  it("answers the sale without the line", async () => {
    const lineId = await sellTwoYerbas();

    expect(await removeSaleLineFor(deps(), lineId)).toEqual({
      kind: "removed",
      sale: {
        id: "id-1",
        lines: [],
        total: 0,
        paid: 0,
        pending: 0,
        lines_editable: true,
        cancellable: true,
        charge_refusal: null,
        refunds_on_cancel: [],
        cancel_authorization_required: true,
      },
    });
  });

  it("answers the domain's refusal of a line the sale does not have", async () => {
    await sellTwoYerbas();

    expect(await removeSaleLineFor(deps(), "other-line")).toEqual({ kind: "unknown_line" });
  });

  it("answers that there is no sale to change", async () => {
    expect(await removeSaleLineFor(deps(), "id-2")).toEqual({ kind: "no_open_sale" });
  });

  it("answers not signed in when nobody is signed in", async () => {
    const lineId = await sellTwoYerbas();
    signedInPerson.clear();

    expect(await removeSaleLineFor(deps(), lineId)).toEqual({ kind: "not_signed_in" });
  });

  it("answers not permitted to a person who sells but did not open the session", async () => {
    const lineId = await sellTwoYerbas();
    addPerson("u3", "cashier");
    signedInPerson.set("u3");

    expect(await removeSaleLineFor(deps(), lineId)).toEqual({ kind: "not_permitted" });
  });

  it("answers that no session is open", async () => {
    const lineId = await sellTwoYerbas();
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await removeSaleLineFor(deps(), lineId)).toEqual({ kind: "no_open_session" });
  });
});

describe("cancelling the sale", () => {
  it("cancels it, leaving neither the sale nor an event behind", async () => {
    await sellTwoYerbas();

    expect(await cancelSaleFor(deps())).toEqual({ kind: "cancelled" });

    expect(database.prepare("SELECT id FROM sales").all()).toEqual([]);
    expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([]);
  });

  it("lets the next scan start a new sale", async () => {
    const shared = deps();
    await scanProductFor(shared, "111");
    await cancelSaleFor(shared);

    expect(await scanProductFor(shared, "111")).toMatchObject({
      kind: "added",
      sale: { lines: [{ quantity: 1 }], total: 1500 },
    });
    expect(await currentSaleFor(shared)).toMatchObject({ total: 1500 });
  });

  it("answers that there is no sale to cancel", async () => {
    expect(await cancelSaleFor(deps())).toEqual({ kind: "no_open_sale" });
  });

  it("answers not signed in when nobody is signed in", async () => {
    await sellTwoYerbas();
    signedInPerson.clear();

    expect(await cancelSaleFor(deps())).toEqual({ kind: "not_signed_in" });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
  });

  it("answers not permitted to a person who sells but did not open the session", async () => {
    await sellTwoYerbas();
    addPerson("u3", "cashier");
    signedInPerson.set("u3");

    expect(await cancelSaleFor(deps())).toEqual({ kind: "not_permitted" });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
  });

  it("answers that no session is open", async () => {
    await sellTwoYerbas();
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await cancelSaleFor(deps())).toEqual({ kind: "no_open_session" });
  });

  it("cancels it even when the register has no outbox key yet", async () => {
    await sellTwoYerbas();

    expect(await cancelSaleFor(deps({ readOutboxChainKey: async () => undefined }))).toEqual({
      kind: "cancelled",
    });
    expect(database.prepare("SELECT id FROM sales").all()).toEqual([]);
  });
});

describe("charging the sale in progress in cash", () => {
  async function sellTwo(): Promise<string> {
    await scanProductFor(deps(), "111");
    const outcome = await scanProductFor(deps(), "111");
    if (outcome.kind !== "added") {
      throw new Error("test setup: the product was not added");
    }
    return outcome.sale.id;
  }

  it("completes the sale and answers what was charged and the change", async () => {
    addFiscalConfiguration();
    const saleId = await sellTwo();

    expect(await chargeSaleInCashFor(deps(), { saleId, tendered: 5000 })).toEqual({
      kind: "completed",
      sale_id: saleId,
      total: 3000,
      tendered: 5000,
      change: 2000,
    });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "COMPLETED" }]);
    expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([
      { event_type: "sale_completed" },
    ]);
  });

  it("answers the sale as refused when what it adds reaches the threshold", async () => {
    saveThreshold(3000, "2026-09-30");
    await scanProductFor(deps(), "111");

    expect(await scanProductFor(deps(), "111")).toMatchObject({
      kind: "added",
      sale: {
        charge_refusal: { kind: "reaches_buyer_identification_threshold", threshold: 3000 },
      },
    });
  });

  it("refuses to charge a sale that reaches the threshold, leaving it open", async () => {
    saveThreshold(3000, "2026-09-30");
    const saleId = await sellTwo();

    expect(await chargeSaleInCashFor(deps(), { saleId, tendered: 5000 })).toEqual({
      kind: "reaches_buyer_identification_threshold",
      threshold: 3000,
    });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
  });

  it("refuses to charge any sale while the register holds no threshold", async () => {
    database.prepare("DELETE FROM buyer_identification_thresholds").run();
    const saleId = await sellTwo();

    expect(await chargeSaleInCashFor(deps(), { saleId, tendered: 5000 })).toEqual({
      kind: "no_buyer_identification_threshold",
    });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
  });

  it("composes the factura C of the completed sale from the register's fiscal configuration", async () => {
    addFiscalConfiguration();
    const saleId = await sellTwo();

    await chargeSaleInCashFor(deps(), { saleId, tendered: 5000 });

    expect(
      database.prepare("SELECT sale_id, outcome, document FROM pre_emission_gate_outcomes").all(),
    ).toEqual([
      {
        sale_id: saleId,
        outcome: "PASSED",
        document: expect.stringContaining('"netAmount":3000,"vatAmount":0'),
      },
    ]);
    expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([
      { event_type: "sale_completed" },
    ]);
  });

  it("completes the sale and answers as usual when the pre-emission gate fails, queuing the failure", async () => {
    const saleId = await sellTwo();

    expect(await chargeSaleInCashFor(deps(), { saleId, tendered: 5000 })).toEqual({
      kind: "completed",
      sale_id: saleId,
      total: 3000,
      tendered: 5000,
      change: 2000,
    });
    expect(
      database.prepare("SELECT outcome, failure_reason FROM pre_emission_gate_outcomes").all(),
    ).toEqual([{ outcome: "FAILED", failure_reason: "issuer_identification_missing" }]);
    expect(database.prepare("SELECT event_type FROM outbox ORDER BY device_seq").all()).toEqual([
      { event_type: "sale_completed" },
      { event_type: "fiscal_gate_failed" },
    ]);
  });

  it("completes nothing when the pre-emission gate of the sale cannot be recorded", async () => {
    const saleId = await sellTwo();
    database.exec("DROP TABLE pre_emission_gate_outcomes");

    await expect(chargeSaleInCashFor(deps(), { saleId, tendered: 5000 })).rejects.toThrow();

    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
    expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([]);
  });

  it("answers what is paid and what is pending when the cash does not cover the sale, leaving it open", async () => {
    const saleId = await sellTwo();

    expect(await chargeSaleInCashFor(deps(), { saleId, tendered: 1000 })).toEqual({
      kind: "partially_paid",
      sale_id: saleId,
      total: 3000,
      paid: 1000,
      pending: 2000,
    });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
    expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([]);
  });

  it.each([
    ["an amount that is not a valid cash amount", "invalid_amount", 0],
    ["a sale that is not the one in progress", "no_open_sale", 3000],
  ] as const)("answers the domain's refusal of %s", async (_case, kind, tendered) => {
    const saleId = await sellTwo();

    expect(
      await chargeSaleInCashFor(deps(), {
        saleId: kind === "no_open_sale" ? "other-sale" : saleId,
        tendered,
      }),
    ).toEqual({ kind });
  });

  it("answers the domain's refusal of a sale whose total is zero", async () => {
    const saleId = await sellTwo();
    database.prepare("UPDATE sale_lines SET line_total = 0").run();

    expect(await chargeSaleInCashFor(deps(), { saleId, tendered: 3000 })).toEqual({
      kind: "zero_total",
    });
  });

  it("answers that no session is open", async () => {
    const saleId = await sellTwo();
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await chargeSaleInCashFor(deps(), { saleId, tendered: 3000 })).toEqual({
      kind: "no_open_session",
    });
  });

  it("answers not signed in when nobody is signed in", async () => {
    const saleId = await sellTwo();
    signedInPerson.clear();

    expect(await chargeSaleInCashFor(deps(), { saleId, tendered: 3000 })).toEqual({
      kind: "not_signed_in",
    });
  });

  it("answers not permitted to a signed-in person without the permission to sell", async () => {
    const saleId = await sellTwo();
    addPerson("u2", "guest");
    signedInPerson.set("u2");

    expect(await chargeSaleInCashFor(deps(), { saleId, tendered: 3000 })).toEqual({
      kind: "not_permitted",
    });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
  });

  it("answers unavailable, charging nothing, when the register holds no outbox chain key", async () => {
    const saleId = await sellTwo();

    expect(
      await chargeSaleInCashFor(deps({ readOutboxChainKey: async () => undefined }), {
        saleId,
        tendered: 3000,
      }),
    ).toEqual({ kind: "unavailable" });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
  });
});

describe("charging the sale in progress by transfer", () => {
  async function sellTwo(): Promise<string> {
    await scanProductFor(deps(), "111");
    const outcome = await scanProductFor(deps(), "111");
    if (outcome.kind !== "added") {
      throw new Error("test setup: the product was not added");
    }
    return outcome.sale.id;
  }

  it("completes the sale and answers what was charged", async () => {
    addFiscalConfiguration();
    const saleId = await sellTwo();

    expect(await chargeSaleByTransferFor(deps(), { saleId, amount: 3000 })).toEqual({
      kind: "completed",
      sale_id: saleId,
      total: 3000,
    });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "COMPLETED" }]);
    expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([
      { event_type: "sale_completed" },
    ]);
  });

  it("records one approved transfer for the amount, confirmed by the signed-in person", async () => {
    const saleId = await sellTwo();

    await chargeSaleByTransferFor(deps(), { saleId, amount: 3000 });

    expect(
      database
        .prepare(
          "SELECT sale_id, method, amount, tendered, authorized_by, confirmed_at, state FROM payment_transactions",
        )
        .all(),
    ).toEqual([
      {
        sale_id: saleId,
        method: "TRANSFER",
        amount: 3000,
        tendered: null,
        authorized_by: "u1",
        confirmed_at: NOW.toISOString(),
        state: "APPROVED",
      },
    ]);
  });

  it("composes the factura C of the completed sale like a cash charge does", async () => {
    addFiscalConfiguration();
    const saleId = await sellTwo();

    await chargeSaleByTransferFor(deps(), { saleId, amount: 3000 });

    expect(
      database.prepare("SELECT sale_id, outcome FROM pre_emission_gate_outcomes").all(),
    ).toEqual([{ sale_id: saleId, outcome: "PASSED" }]);
  });

  it("completes nothing when the pre-emission gate of the sale cannot be recorded", async () => {
    const saleId = await sellTwo();
    database.exec("DROP TABLE pre_emission_gate_outcomes");

    await expect(chargeSaleByTransferFor(deps(), { saleId, amount: 3000 })).rejects.toThrow();

    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
    expect(database.prepare("SELECT count(*) AS total FROM payment_transactions").get()).toEqual({
      total: 0,
    });
  });

  it("answers what is paid and what is pending when the transfer does not cover the sale, leaving it open", async () => {
    const saleId = await sellTwo();

    expect(await chargeSaleByTransferFor(deps(), { saleId, amount: 1200 })).toEqual({
      kind: "partially_paid",
      sale_id: saleId,
      total: 3000,
      paid: 1200,
      pending: 1800,
    });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
    expect(database.prepare("SELECT method, amount FROM payment_transactions").all()).toEqual([
      { method: "TRANSFER", amount: 1200 },
    ]);
  });

  it("answers how much is pending when the transfer exceeds it, charging nothing", async () => {
    const saleId = await sellTwo();

    expect(await chargeSaleByTransferFor(deps(), { saleId, amount: 3001 })).toEqual({
      kind: "exceeds_pending",
      pending: 3000,
    });
    expect(database.prepare("SELECT count(*) AS total FROM payment_transactions").get()).toEqual({
      total: 0,
    });
  });

  it("answers the domain's refusal of an amount that is not positive", async () => {
    const saleId = await sellTwo();

    expect(await chargeSaleByTransferFor(deps(), { saleId, amount: 0 })).toEqual({
      kind: "invalid_amount",
    });
  });

  it("answers the domain's refusal of a sale that is not the one in progress", async () => {
    await sellTwo();

    expect(await chargeSaleByTransferFor(deps(), { saleId: "other-sale", amount: 3000 })).toEqual({
      kind: "no_open_sale",
    });
  });

  it("refuses to charge by transfer a sale that reaches the threshold, leaving it open", async () => {
    saveThreshold(3000, "2026-09-30");
    const saleId = await sellTwo();

    expect(await chargeSaleByTransferFor(deps(), { saleId, amount: 3000 })).toEqual({
      kind: "reaches_buyer_identification_threshold",
      threshold: 3000,
    });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
    expect(database.prepare("SELECT count(*) AS total FROM payment_transactions").get()).toEqual({
      total: 0,
    });
  });

  it("refuses to charge by transfer any sale while the register holds no threshold", async () => {
    database.prepare("DELETE FROM buyer_identification_thresholds").run();
    const saleId = await sellTwo();

    expect(await chargeSaleByTransferFor(deps(), { saleId, amount: 3000 })).toEqual({
      kind: "no_buyer_identification_threshold",
    });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
  });

  it("answers the domain's refusal of a sale whose total is zero", async () => {
    const saleId = await sellTwo();
    database.prepare("UPDATE sale_lines SET line_total = 0").run();

    expect(await chargeSaleByTransferFor(deps(), { saleId, amount: 3000 })).toEqual({
      kind: "zero_total",
    });
  });

  it("answers the domain's refusal of a sale without lines", async () => {
    const saleId = await sellTwo();
    database.exec("DELETE FROM sale_line_promotions; DELETE FROM sale_lines");

    expect(await chargeSaleByTransferFor(deps(), { saleId, amount: 3000 })).toEqual({
      kind: "empty_sale",
    });
  });

  it("answers that no session is open", async () => {
    const saleId = await sellTwo();
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await chargeSaleByTransferFor(deps(), { saleId, amount: 3000 })).toEqual({
      kind: "no_open_session",
    });
  });

  it("answers not signed in when nobody is signed in", async () => {
    const saleId = await sellTwo();
    signedInPerson.clear();

    expect(await chargeSaleByTransferFor(deps(), { saleId, amount: 3000 })).toEqual({
      kind: "not_signed_in",
    });
  });

  it("answers not permitted to a signed-in person without the permission to sell", async () => {
    const saleId = await sellTwo();
    addPerson("u2", "guest");
    signedInPerson.set("u2");

    expect(await chargeSaleByTransferFor(deps(), { saleId, amount: 3000 })).toEqual({
      kind: "not_permitted",
    });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
    expect(database.prepare("SELECT count(*) AS total FROM payment_transactions").get()).toEqual({
      total: 0,
    });
  });

  it("answers unavailable, charging nothing, when the register holds no outbox chain key", async () => {
    const saleId = await sellTwo();

    expect(
      await chargeSaleByTransferFor(deps({ readOutboxChainKey: async () => undefined }), {
        saleId,
        amount: 3000,
      }),
    ).toEqual({ kind: "unavailable" });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
  });
});

describe("what a sale in progress needs when an amount is tendered", () => {
  async function sellTwo(): Promise<string> {
    await scanProductFor(deps(), "111");
    const outcome = await scanProductFor(deps(), "111");
    if (outcome.kind !== "added") {
      throw new Error("test setup: the product was not added");
    }
    return outcome.sale.id;
  }

  it.each([
    [5000, { kind: "covered", applied: 3000, change: 2000 }],
    [3000, { kind: "covered", applied: 3000, change: 0 }],
    [1000, { kind: "partial", applied: 1000, pending: 2000 }],
    [0, { kind: "invalid_amount" }],
  ] as const)(
    "answers the domain's charge of %i against the total of the sale",
    async (tendered, charge) => {
      const saleId = await sellTwo();

      expect(await cashChargeFor(deps(), { saleId, tendered })).toEqual(charge);
    },
  );

  it("answers the charge against what is still pending once a payment was approved", async () => {
    const saleId = await sellTwo();
    await chargeSaleByTransferFor(deps(), { saleId, amount: 1200 });

    expect(await cashChargeFor(deps(), { saleId, tendered: 2000 })).toEqual({
      kind: "covered",
      applied: 1800,
      change: 200,
    });
    expect(await cashChargeFor(deps(), { saleId, tendered: 500 })).toEqual({
      kind: "partial",
      applied: 500,
      pending: 1300,
    });
  });

  it("charges nothing and changes nothing", async () => {
    const saleId = await sellTwo();

    await cashChargeFor(deps(), { saleId, tendered: 5000 });

    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
    expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([]);
  });

  it("is none for a sale that is not the one in progress", async () => {
    await sellTwo();

    expect(await cashChargeFor(deps(), { saleId: "other-sale", tendered: 5000 })).toBeNull();
  });

  it("is none when no session is open", async () => {
    const saleId = await sellTwo();
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await cashChargeFor(deps(), { saleId, tendered: 5000 })).toBeNull();
  });

  it("is none when nobody is signed in", async () => {
    const saleId = await sellTwo();
    signedInPerson.clear();

    expect(await cashChargeFor(deps(), { saleId, tendered: 5000 })).toBeNull();
  });

  it("answers not permitted to a signed-in person without the permission to sell", async () => {
    const saleId = await sellTwo();
    addPerson("u2", "guest");
    signedInPerson.set("u2");

    expect(await cashChargeFor(deps(), { saleId, tendered: 5000 })).toBe("not_permitted");
  });
});

describe("cancelling the open sale of a locked register", () => {
  function lockedDeps(overrides: Partial<OutboxSaleRequestDeps> = {}): OutboxSaleRequestDeps {
    return deps({
      ids: idsStartingWith("cancelled"),
      gate: createActionGate({
        store: new SqliteSignInStore(database),
        signedInPerson,
        readPepper: async () => PEPPER,
        hashPin: async (pin) => (pin === CLOSER_PIN ? PIN_HASH : "hash-of-another-pin"),
        now: () => NOW,
      }),
      ...overrides,
    });
  }

  function addCloser(permissions: string[]): void {
    database
      .prepare(
        "INSERT INTO roles (id, name, is_administrator, version) VALUES ('closer', 'Encargada', 0, 1)",
      )
      .run();
    for (const key of permissions) {
      database
        .prepare(
          "INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('closer', ?, 1)",
        )
        .run(key);
    }
    addPerson("u9", "closer");
    database
      .prepare("UPDATE users SET salt = ? WHERE id = 'u9'")
      .run(encodePinHash(new Uint8Array(16).fill(1)));
    database
      .prepare("INSERT INTO pin_verifiers (user_id, verifier) VALUES ('u9', ?)")
      .run(derivePinVerifier(PEPPER, PIN_HASH));
  }

  async function lockedWithOpenSale(): Promise<string> {
    const saleId = await sellTwoForPayments();
    signedInPerson.clear();
    return saleId;
  }

  async function lockedWithPartPaidSale(): Promise<string> {
    const saleId = await sellTwoForPayments();
    await chargeSaleInCashFor(deps({ ids: idsStartingWith("charged") }), {
      saleId,
      tendered: 1000,
    });
    signedInPerson.clear();
    return saleId;
  }

  function saleStates(): unknown[] {
    return database.prepare("SELECT state FROM sales").all();
  }

  it("cancels the sale for the person whose PIN holds the permission, leaving neither the sale nor an event behind", async () => {
    addCloser(["close_anothers_register_session"]);
    const saleId = await lockedWithOpenSale();

    expect(await cancelLockedSaleFor(lockedDeps(), { saleId, closer: CLOSER })).toEqual({
      kind: "cancelled",
      refunds: [],
    });

    expect(saleStates()).toEqual([]);
    expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([]);
  });

  it("leaves nobody signed in", async () => {
    addCloser(["close_anothers_register_session"]);
    const saleId = await lockedWithOpenSale();

    await cancelLockedSaleFor(lockedDeps(), { saleId, closer: CLOSER });

    expect(signedInPerson.userId()).toBeUndefined();
  });

  it("refuses a person without the permission, leaving the sale open", async () => {
    addCloser(["sell_and_charge"]);
    const saleId = await lockedWithOpenSale();

    expect(await cancelLockedSaleFor(lockedDeps(), { saleId, closer: CLOSER })).toEqual({
      kind: "lacks_permission",
    });
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });

  it("refuses the person who opened the session, leaving the sale open", async () => {
    addCloser(["close_anothers_register_session"]);
    const saleId = await lockedWithOpenSale();
    database.prepare("UPDATE cash_sessions SET opened_by = 'u9'").run();

    expect(await cancelLockedSaleFor(lockedDeps(), { saleId, closer: CLOSER })).toEqual({
      kind: "lacks_permission",
    });
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });

  it("refuses a wrong PIN, leaving the sale open", async () => {
    addCloser(["close_anothers_register_session"]);
    const saleId = await lockedWithOpenSale();

    const outcome = await cancelLockedSaleFor(lockedDeps(), {
      saleId,
      closer: { user_id: "u9", pin: "0000" },
    });

    expect(outcome.kind).toBe("wrong_pin");
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });

  it("refuses while someone is signed in, leaving the sale open", async () => {
    addCloser(["close_anothers_register_session"]);
    const saleId = await sellTwoForPayments();

    expect(await cancelLockedSaleFor(lockedDeps(), { saleId, closer: CLOSER })).toEqual({
      kind: "not_locked",
    });
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });

  it("answers that there is no sale to cancel", async () => {
    addCloser(["close_anothers_register_session"]);
    signedInPerson.clear();

    expect(await cancelLockedSaleFor(lockedDeps(), { saleId: "id-1", closer: CLOSER })).toEqual({
      kind: "no_open_sale",
    });
  });

  it("refuses when no session is open", async () => {
    addCloser(["close_anothers_register_session"]);
    const saleId = await lockedWithOpenSale();
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await cancelLockedSaleFor(lockedDeps(), { saleId, closer: CLOSER })).toEqual({
      kind: "lacks_permission",
    });
  });

  it("cancels a part-paid sale, giving the cash back as a refund movement of the closer", async () => {
    addCloser(["close_anothers_register_session", "void_sale"]);
    const saleId = await lockedWithPartPaidSale();
    const [payment] = database
      .prepare<[], { id: string }>("SELECT id FROM payment_transactions")
      .all();

    expect(await cancelLockedSaleFor(lockedDeps(), { saleId, closer: CLOSER })).toEqual({
      kind: "cancelled",
      refunds: [{ payment_id: payment?.id, method: "CASH", amount: 1000, state: "APPROVED" }],
    });

    expect(saleStates()).toEqual([{ state: "CANCELLED" }]);
    expect(
      database
        .prepare(
          "SELECT type, amount, actor_id, authorized_by FROM cash_movements WHERE type = 'REFUND'",
        )
        .all(),
    ).toEqual([{ type: "REFUND", amount: 1000, actor_id: "u9", authorized_by: "u9" }]);
    expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([
      { event_type: "sale_cancelled" },
    ]);
  });

  it("counts the payment and its refund in the cash expected at closing, which ends up as the opening float", async () => {
    addCloser(["close_anothers_register_session", "void_sale"]);
    const saleId = await lockedWithPartPaidSale();

    await cancelLockedSaleFor(lockedDeps(), { saleId, closer: CLOSER });

    expect(cashBalanceFor(database)).toMatchObject({
      cash_sales: { amount: 1000 },
      refunds: { amount: 1000 },
      expected: 0,
    });
  });

  it("leaves a transfer refund pending when it cancels a sale paid by transfer", async () => {
    addCloser(["close_anothers_register_session", "void_sale"]);
    const saleId = await sellTwoForPayments();
    await chargeSaleByTransferFor(deps({ ids: idsStartingWith("charged") }), {
      saleId,
      amount: 1000,
    });
    signedInPerson.clear();

    expect(await cancelLockedSaleFor(lockedDeps(), { saleId, closer: CLOSER })).toMatchObject({
      kind: "cancelled",
      refunds: [{ method: "TRANSFER", state: "PENDING" }],
    });
    expect(database.prepare("SELECT method, state FROM payment_refunds").all()).toEqual([
      { method: "TRANSFER", state: "PENDING" },
    ]);
  });

  it("refuses a closer who may not void a sale with approved payments, changing nothing", async () => {
    addCloser(["close_anothers_register_session"]);
    const saleId = await lockedWithPartPaidSale();

    expect(await cancelLockedSaleFor(lockedDeps(), { saleId, closer: CLOSER })).toEqual({
      kind: "not_permitted",
    });
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
    expect(database.prepare("SELECT id FROM payment_refunds").all()).toEqual([]);
    expect(database.prepare("SELECT id FROM cash_movements WHERE type = 'REFUND'").all()).toEqual(
      [],
    );
    expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([]);
  });

  it("answers that it is unavailable when the register has no outbox key yet, changing nothing", async () => {
    addCloser(["close_anothers_register_session", "void_sale"]);
    const saleId = await lockedWithOpenSale();

    expect(
      await cancelLockedSaleFor(lockedDeps({ readOutboxChainKey: async () => undefined }), {
        saleId,
        closer: CLOSER,
      }),
    ).toEqual({ kind: "unavailable" });
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });

  it("refuses a sale that is not the open one", async () => {
    addCloser(["close_anothers_register_session"]);
    await lockedWithOpenSale();

    expect(
      await cancelLockedSaleFor(lockedDeps(), { saleId: "another-sale", closer: CLOSER }),
    ).toEqual({ kind: "no_open_sale" });
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });
});

describe("editing the lines of a sale with an approved payment", () => {
  async function sellTwoPartlyPaid(): Promise<void> {
    const saleId = await sellTwoForPayments();
    await chargeSaleInCashFor(deps(), { saleId, tendered: 1000 });
  }

  it("answers that a scanned product cannot be added", async () => {
    await sellTwoPartlyPaid();

    expect(await scanProductFor(deps(), "111")).toEqual({ kind: "sale_has_payments" });
  });

  it("answers that a searched product cannot be added", async () => {
    await sellTwoPartlyPaid();

    expect(await addSearchedProductFor(deps(), "p1")).toEqual({ kind: "sale_has_payments" });
  });

  it("answers that a line's quantity cannot change", async () => {
    await sellTwoPartlyPaid();

    expect(await changeLineQuantityFor(deps(), "id-2", 1, 2)).toEqual({
      kind: "sale_has_payments",
    });
  });

  it("answers that a line cannot be removed", async () => {
    await sellTwoPartlyPaid();

    expect(await removeSaleLineFor(deps(), "id-2")).toEqual({ kind: "sale_has_payments" });
  });
});

describe("cancelling the sale in progress after a payment was approved", () => {
  function pinGate() {
    return createActionGate({
      store: new SqliteSignInStore(database),
      signedInPerson,
      readPepper: async () => PEPPER,
      hashPin: async (pin) => (pin === CLOSER_PIN ? PIN_HASH : "hash-of-another-pin"),
      now: () => NOW,
    });
  }

  function addPersonWithPin(id: string, firstName: string, permissions: string[]): void {
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

  const ids = idsStartingWith("cancelled");

  function withPins(overrides: Partial<OutboxSaleRequestDeps> = {}): OutboxSaleRequestDeps {
    return deps({ gate: pinGate(), ids, ...overrides });
  }

  async function partlyPaidInCash(): Promise<string> {
    const saleId = await sellTwoForPayments();
    await chargeSaleInCashFor(deps({ ids }), { saleId, tendered: 1000 });
    return saleId;
  }

  function saleStates(): unknown[] {
    return database.prepare("SELECT state FROM sales").all();
  }

  it("cancels it for a person with the void sale permission, giving the cash back", async () => {
    addPersonWithPin("u2", "Grace", ["sell_and_charge", "void_sale"]);
    database.prepare("UPDATE cash_sessions SET opened_by = 'u2'").run();
    signedInPerson.set("u2");
    const saleId = await partlyPaidInCash();
    const [payment] = database
      .prepare<[], { id: string }>("SELECT id FROM payment_transactions")
      .all();

    expect(await cancelPaidSaleFor(withPins(), { saleId })).toEqual({
      kind: "cancelled",
      refunds: [{ payment_id: payment?.id, method: "CASH", amount: 1000, state: "APPROVED" }],
      authorized_by: null,
    });
    expect(saleStates()).toEqual([{ state: "CANCELLED" }]);
    expect(
      database
        .prepare(
          "SELECT type, amount, actor_id, authorized_by FROM cash_movements WHERE type = 'REFUND'",
        )
        .all(),
    ).toEqual([{ type: "REFUND", amount: 1000, actor_id: "u2", authorized_by: null }]);
  });

  it("cancels it with the PIN of a person who holds the permission, naming who authorized it", async () => {
    addPersonWithPin("u2", "Grace", ["void_sale"]);
    const saleId = await partlyPaidInCash();

    expect(
      await cancelPaidSaleFor(withPins(), {
        saleId,
        authorization: { user_id: "u2", pin: CLOSER_PIN },
      }),
    ).toMatchObject({
      kind: "cancelled",
      authorized_by: { user_id: "u2", first_name: "Grace" },
    });
    expect(database.prepare("SELECT state, cancellation_authorized_by FROM sales").all()).toEqual([
      { state: "CANCELLED", cancellation_authorized_by: "u2" },
    ]);
    expect(
      database
        .prepare("SELECT actor_id, authorized_by FROM cash_movements WHERE type = 'REFUND'")
        .all(),
    ).toEqual([{ actor_id: "u1", authorized_by: "u2" }]);
  });

  it("leaves a transfer refund pending", async () => {
    addPersonWithPin("u2", "Grace", ["void_sale"]);
    const saleId = await sellTwoForPayments();
    await chargeSaleByTransferFor(deps({ ids }), { saleId, amount: 1000 });

    expect(
      await cancelPaidSaleFor(withPins(), {
        saleId,
        authorization: { user_id: "u2", pin: CLOSER_PIN },
      }),
    ).toMatchObject({ kind: "cancelled", refunds: [{ method: "TRANSFER", state: "PENDING" }] });
    expect(database.prepare("SELECT method, state FROM payment_refunds").all()).toEqual([
      { method: "TRANSFER", state: "PENDING" },
    ]);
  });

  it("refuses a cashier without the permission who brings no authorization, changing nothing", async () => {
    const saleId = await partlyPaidInCash();

    expect(await cancelPaidSaleFor(withPins(), { saleId })).toEqual({ kind: "lacks_permission" });
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });

  it("refuses a wrong PIN, changing nothing", async () => {
    addPersonWithPin("u2", "Grace", ["void_sale"]);
    const saleId = await partlyPaidInCash();

    const outcome = await cancelPaidSaleFor(withPins(), {
      saleId,
      authorization: { user_id: "u2", pin: "0000" },
    });

    expect(outcome.kind).toBe("wrong_pin");
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });

  it("refuses the PIN of a person who lacks the permission, changing nothing", async () => {
    addPersonWithPin("u2", "Grace", ["sell_and_charge"]);
    const saleId = await partlyPaidInCash();

    expect(
      await cancelPaidSaleFor(withPins(), {
        saleId,
        authorization: { user_id: "u2", pin: CLOSER_PIN },
      }),
    ).toEqual({ kind: "lacks_permission" });
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });

  it("answers that the sale asked for is not the one in progress", async () => {
    await partlyPaidInCash();
    addPersonWithPin("u2", "Grace", ["void_sale"]);

    expect(
      await cancelPaidSaleFor(withPins(), {
        saleId: "another-sale",
        authorization: { user_id: "u2", pin: CLOSER_PIN },
      }),
    ).toEqual({ kind: "no_open_sale" });
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });

  it("answers not signed in when nobody is signed in", async () => {
    const saleId = await partlyPaidInCash();
    signedInPerson.clear();

    expect(await cancelPaidSaleFor(withPins(), { saleId })).toEqual({ kind: "not_signed_in" });
  });

  it("answers that no session is open", async () => {
    addPersonWithPin("u2", "Grace", ["void_sale"]);
    const saleId = await partlyPaidInCash();
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(
      await cancelPaidSaleFor(withPins(), {
        saleId,
        authorization: { user_id: "u2", pin: CLOSER_PIN },
      }),
    ).toEqual({ kind: "no_open_session" });
  });

  it("answers not permitted to a person who sells but did not open the session", async () => {
    addPersonWithPin("u2", "Grace", ["void_sale"]);
    addPersonWithPin("u3", "Bruno", ["sell_and_charge"]);
    const saleId = await partlyPaidInCash();
    signedInPerson.set("u3");

    expect(
      await cancelPaidSaleFor(withPins(), {
        saleId,
        authorization: { user_id: "u2", pin: CLOSER_PIN },
      }),
    ).toEqual({ kind: "not_permitted" });
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });

  it("answers unavailable, cancelling nothing, when the register holds no outbox chain key", async () => {
    addPersonWithPin("u2", "Grace", ["void_sale"]);
    const saleId = await partlyPaidInCash();

    expect(
      await cancelPaidSaleFor(withPins({ readOutboxChainKey: async () => undefined }), {
        saleId,
        authorization: { user_id: "u2", pin: CLOSER_PIN },
      }),
    ).toEqual({ kind: "unavailable" });
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });

  it("leaves no sale in progress", async () => {
    addPersonWithPin("u2", "Grace", ["void_sale"]);
    const saleId = await partlyPaidInCash();
    await cancelPaidSaleFor(withPins(), {
      saleId,
      authorization: { user_id: "u2", pin: CLOSER_PIN },
    });

    expect(await currentSaleFor(deps())).toBeNull();
  });
});
