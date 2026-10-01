import { encodePinHash } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createActionGate } from "../access/action-gate";
import { derivePinVerifier } from "../access/pin-verifier";
import { createSignedInPerson, type SignedInPerson } from "../access/signed-in-person";
import { SqliteSignInStore } from "../access/sqlite-sign-in-store";
import { type LocalDatabase, openLocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import {
  addSearchedProductFor,
  cancelLockedSaleFor,
  cancelSaleFor,
  cashChargeFor,
  changeLineQuantityFor,
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

function addPerson(id: string, roleId: string): void {
  database
    .prepare(
      "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES (?, 'Ana', ?, 's', 1, 1)",
    )
    .run(id, roleId);
}

function addFiscalConfiguration(): void {
  database
    .prepare(
      `INSERT INTO issuer_identification_versions (
         version, legal_name, gross_income_registration, activity_start_date, authorized_cuit, tax_status
       ) VALUES (1, 'Comercio de Prueba', '901-000000-0', '2020-01-15', '20000000000', 'Condicion de prueba')`,
    )
    .run();
  database
    .prepare(
      "INSERT INTO buyer_tax_status_sets (params_version, set_id, options) VALUES (1, 'set-1', ?)",
    )
    .run(JSON.stringify([{ code: 90, description: "Consumidor Final", invoice_class: "A/M/C" }]));
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
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS);
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
    });
  });
});

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

  it("keeps what a lowered quantity took away", async () => {
    const lineId = await sellTwoYerbas();

    await changeLineQuantityFor(deps(), lineId, 1, 2);

    expect(database.prepare("SELECT qty_removed FROM sale_line_removals").all()).toEqual([
      { qty_removed: 1 },
    ]);
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
  it("answers the sale without the line and keeps the removal", async () => {
    const lineId = await sellTwoYerbas();

    expect(await removeSaleLineFor(deps(), lineId)).toEqual({
      kind: "removed",
      sale: { id: "id-1", lines: [], total: 0 },
    });
    expect(
      database.prepare("SELECT qty_removed, amount_removed FROM sale_line_removals").all(),
    ).toEqual([{ qty_removed: 2, amount_removed: 3000 }]);
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
  it("cancels it and emits one chained sale_cancelled event", async () => {
    await sellTwoYerbas();

    expect(await cancelSaleFor(deps())).toEqual({ kind: "cancelled" });

    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "CANCELLED" }]);
    const events = database
      .prepare(
        "SELECT device_seq, chain_hmac, payload FROM outbox WHERE event_type = 'sale_cancelled'",
      )
      .all() as { device_seq: number; chain_hmac: string; payload: string }[];
    expect(events).toHaveLength(1);
    expect(events[0]?.device_seq).toBe(1);
    expect(events[0]?.chain_hmac).toBeTruthy();
    expect(JSON.parse(events[0]?.payload ?? "")).toMatchObject({
      id: "id-1",
      lines: [{ product_id: "p1", quantity: 2 }],
      removals: [],
    });
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

  it("answers unavailable, leaving the sale open, when the register has no outbox key yet", async () => {
    await sellTwoYerbas();

    expect(await cancelSaleFor(deps({ readOutboxChainKey: async () => undefined }))).toEqual({
      kind: "unavailable",
    });
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

  it("answers how much is still due when the cash does not cover the sale", async () => {
    const saleId = await sellTwo();

    expect(await chargeSaleInCashFor(deps(), { saleId, tendered: 1000 })).toEqual({
      kind: "insufficient_cash",
      amount_due: 3000,
    });
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
    [1000, { kind: "insufficient", amountDue: 3000 }],
    [0, { kind: "invalid_amount" }],
  ] as const)(
    "answers the domain's charge of %i against the total of the sale",
    async (tendered, charge) => {
      const saleId = await sellTwo();

      expect(await cashChargeFor(deps(), { saleId, tendered })).toEqual(charge);
    },
  );

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

  async function lockedWithOpenSale(): Promise<void> {
    await sellTwoYerbas();
    signedInPerson.clear();
  }

  function saleStates(): unknown[] {
    return database.prepare("SELECT state FROM sales").all();
  }

  it("cancels the sale as the person whose PIN holds the permission and emits the cancellation in their name", async () => {
    addCloser(["close_anothers_register_session"]);
    await lockedWithOpenSale();

    expect(await cancelLockedSaleFor(lockedDeps(), CLOSER)).toEqual({ kind: "cancelled" });

    expect(saleStates()).toEqual([{ state: "CANCELLED" }]);
    expect(
      database.prepare("SELECT actor_id FROM outbox WHERE event_type = 'sale_cancelled'").all(),
    ).toEqual([{ actor_id: "u9" }]);
  });

  it("leaves nobody signed in", async () => {
    addCloser(["close_anothers_register_session"]);
    await lockedWithOpenSale();

    await cancelLockedSaleFor(lockedDeps(), CLOSER);

    expect(signedInPerson.userId()).toBeUndefined();
  });

  it("refuses a person without the permission, leaving the sale open", async () => {
    addCloser(["sell_and_charge"]);
    await lockedWithOpenSale();

    expect(await cancelLockedSaleFor(lockedDeps(), CLOSER)).toEqual({ kind: "lacks_permission" });
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });

  it("refuses a wrong PIN, leaving the sale open", async () => {
    addCloser(["close_anothers_register_session"]);
    await lockedWithOpenSale();

    const outcome = await cancelLockedSaleFor(lockedDeps(), { user_id: "u9", pin: "0000" });

    expect(outcome.kind).toBe("wrong_pin");
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });

  it("refuses while someone is signed in, leaving the sale open", async () => {
    addCloser(["close_anothers_register_session"]);
    await sellTwoYerbas();

    expect(await cancelLockedSaleFor(lockedDeps(), CLOSER)).toEqual({ kind: "not_locked" });
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });

  it("answers that there is no sale to cancel", async () => {
    addCloser(["close_anothers_register_session"]);
    signedInPerson.clear();

    expect(await cancelLockedSaleFor(lockedDeps(), CLOSER)).toEqual({ kind: "no_open_sale" });
  });

  it("answers that no session is open", async () => {
    addCloser(["close_anothers_register_session"]);
    await lockedWithOpenSale();
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await cancelLockedSaleFor(lockedDeps(), CLOSER)).toEqual({ kind: "no_open_session" });
  });

  it("refuses a sale that has an approved payment, leaving it open", async () => {
    addCloser(["close_anothers_register_session"]);
    await lockedWithOpenSale();
    database
      .prepare(
        `INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, state, occurred_at)
         VALUES ('payment-1', 'id-1', 'SALE', 'CASH', 'NONE', 3000, NULL, 'APPROVED', '2026-09-30T12:00:00.000Z')`,
      )
      .run();

    expect(await cancelLockedSaleFor(lockedDeps(), CLOSER)).toEqual({
      kind: "has_approved_payment",
    });
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });

  it("answers unavailable, leaving the sale open, when the register has no outbox key yet", async () => {
    addCloser(["close_anothers_register_session"]);
    await lockedWithOpenSale();

    expect(
      await cancelLockedSaleFor(lockedDeps({ readOutboxChainKey: async () => undefined }), CLOSER),
    ).toEqual({ kind: "unavailable" });
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });
});
