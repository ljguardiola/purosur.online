import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type LocalDatabase, openLocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { currentSaleFor, type SaleRequestDeps, scanProductFor } from "./sale-requests";

const NOW = new Date("2026-09-30T12:00:00.000Z");

let database: LocalDatabase;

function deps(overrides: Partial<SaleRequestDeps> = {}): SaleRequestDeps {
  let count = 0;
  return {
    database,
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

function seed(): void {
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
});

afterEach(() => {
  database.close();
});

describe("scanning a product on the register", () => {
  it("answers the sale with each line as the screen shows it and the total to charge", () => {
    scanProductFor(deps(), "u1", "111");

    expect(scanProductFor(deps(), "u1", "111")).toEqual({
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

  it("answers the name of a product that has no price", () => {
    database.prepare("DELETE FROM prices").run();

    expect(scanProductFor(deps(), "u1", "111")).toEqual({
      kind: "no_price",
      product_name: "Yerba",
    });
  });

  it("answers the name of a product sold by weight", () => {
    expect(scanProductFor(deps(), "u1", "222")).toEqual({
      kind: "sold_by_weight",
      product_name: "Queso",
    });
  });

  it.each([
    ["a code no product holds", "u1", "999", "unknown_code"],
    ["a person who may not sell", "nobody", "111", "not_permitted"],
  ])("answers the domain's refusal of %s", (_case, userId, code, kind) => {
    expect(scanProductFor(deps(), userId, code)).toEqual({ kind });
  });

  it("answers that no session is open", () => {
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(scanProductFor(deps(), "u1", "111")).toEqual({ kind: "no_open_session" });
  });

  it("answers that the installation was revoked when no sale was started", () => {
    database
      .prepare("UPDATE sync_state SET installation_revoked_at = '2026-09-30T11:00:00.000Z'")
      .run();

    expect(scanProductFor(deps(), "u1", "111")).toEqual({ kind: "installation_revoked" });
  });

  it("answers unavailable when the register does not know its own identity yet", () => {
    database.prepare("DELETE FROM own_register").run();

    expect(scanProductFor(deps(), "u1", "111")).toEqual({ kind: "unavailable" });
  });
});

describe("the sale in progress", () => {
  it("is none before anything was scanned", () => {
    expect(currentSaleFor(database, "u1")).toBeNull();
  });

  it("is none for a person who may not sell", () => {
    scanProductFor(deps(), "u1", "111");

    expect(currentSaleFor(database, "nobody")).toBeNull();
  });

  it("is the sale with its lines and the total to charge", () => {
    scanProductFor(deps(), "u1", "111");
    scanProductFor(deps(), "u1", "111");

    expect(currentSaleFor(database, "u1")).toEqual({
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
