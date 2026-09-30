import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createActionGate } from "../access/action-gate";
import { createSignedInPerson, type SignedInPerson } from "../access/signed-in-person";
import { SqliteSignInStore } from "../access/sqlite-sign-in-store";
import { type LocalDatabase, openLocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import {
  type ChargeSaleRequestDeps,
  chargeSaleInCashFor,
  currentSaleFor,
  type SaleRequestDeps,
  scanProductFor,
} from "./sale-requests";

const NOW = new Date("2026-09-30T12:00:00.000Z");

const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

let database: LocalDatabase;
let signedInPerson: SignedInPerson;

function deps(overrides: Partial<SaleRequestDeps> = {}): SaleRequestDeps {
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

function chargeDeps(overrides: Partial<ChargeSaleRequestDeps> = {}): ChargeSaleRequestDeps {
  return { ...deps(), readOutboxChainKey: async () => CHAIN_KEY, ...overrides };
}

function addPerson(id: string, roleId: string): void {
  database
    .prepare(
      "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES (?, 'Ana', ?, 's', 1, 1)",
    )
    .run(id, roleId);
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
            line_total: 3000,
          },
        ],
        total: 3000,
      },
    });
  });

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
          line_total: 3000,
        },
      ],
      total: 3000,
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
    const saleId = await sellTwo();

    expect(await chargeSaleInCashFor(chargeDeps(), { saleId, tendered: 5000 })).toEqual({
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

  it("answers how much is still due when the cash does not cover the sale", async () => {
    const saleId = await sellTwo();

    expect(await chargeSaleInCashFor(chargeDeps(), { saleId, tendered: 1000 })).toEqual({
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
      await chargeSaleInCashFor(chargeDeps(), {
        saleId: kind === "no_open_sale" ? "other-sale" : saleId,
        tendered,
      }),
    ).toEqual({ kind });
  });

  it("answers that no session is open", async () => {
    const saleId = await sellTwo();
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await chargeSaleInCashFor(chargeDeps(), { saleId, tendered: 3000 })).toEqual({
      kind: "no_open_session",
    });
  });

  it("answers not signed in when nobody is signed in", async () => {
    const saleId = await sellTwo();
    signedInPerson.clear();

    expect(await chargeSaleInCashFor(chargeDeps(), { saleId, tendered: 3000 })).toEqual({
      kind: "not_signed_in",
    });
  });

  it("answers not permitted to a signed-in person without the permission to sell", async () => {
    const saleId = await sellTwo();
    addPerson("u2", "guest");
    signedInPerson.set("u2");

    expect(await chargeSaleInCashFor(chargeDeps(), { saleId, tendered: 3000 })).toEqual({
      kind: "not_permitted",
    });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
  });

  it("answers unavailable, charging nothing, when the register holds no outbox chain key", async () => {
    const saleId = await sellTwo();

    expect(
      await chargeSaleInCashFor(chargeDeps({ readOutboxChainKey: async () => undefined }), {
        saleId,
        tendered: 3000,
      }),
    ).toEqual({ kind: "unavailable" });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
  });
});
