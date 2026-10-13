import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import {
  readActiveProductByBarcode,
  readActiveProductById,
  readSearchableProducts,
} from "./sqlite-sellable-products";

let database: LocalDatabase;

interface ProductOptions {
  name?: string;
  unit?: string;
  active?: boolean;
  removed?: boolean;
}

function addProduct(id: string, options: ProductOptions = {}): void {
  database
    .prepare(
      `INSERT INTO products (id, name, category_id, sale_unit, active, version, removed)
       VALUES (?, ?, 'c', ?, ?, 1, ?)`,
    )
    .run(
      id,
      options.name ?? "Yerba",
      options.unit ?? "UNIT",
      options.active === false ? 0 : 1,
      options.removed ? 1 : 0,
    );
}

function addBarcode(productId: string, code: string, active = true, position = 1): void {
  database
    .prepare(
      "INSERT INTO product_barcodes (product_id, position, code, active) VALUES (?, ?, ?, ?)",
    )
    .run(productId, position, code, active ? 1 : 0);
}

function addSale(id: string, state: string, productIds: string[], registerId = "register-1"): void {
  database
    .prepare(
      `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
       VALUES (?, ?, 'device-1', 'session-1', 'u1', ?, ?)`,
    )
    .run(id, registerId, state, state === "OPEN" ? null : "2026-09-30T09:00:00.000Z");
  productIds.forEach((productId, index) => {
    database
      .prepare(
        `INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, line_total)
         VALUES (?, ?, ?, ?, 'any', 1, 100, 'list-1', 100)`,
      )
      .run(`${id}-line-${index}`, id, index + 1, productId);
  });
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database
    .prepare("INSERT INTO own_register (id, name, version) VALUES ('register-1', 'Caja 1', 1)")
    .run();
  database
    .prepare(
      `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
       VALUES ('session-1', 'register-1', 'device-1', 'u1', '2026-09-30T08:00:00.000Z', 0, 'OPEN')`,
    )
    .run();
});

afterEach(() => {
  database.close();
});

describe("reading an active product by a barcode", () => {
  it("finds the active product that holds the exact code, with its name and sale unit", () => {
    addProduct("p1", { name: "Queso", unit: "KG" });
    addBarcode("p1", "7791234567890");

    expect(readActiveProductByBarcode(database, "7791234567890")).toEqual({
      id: "p1",
      name: "Queso",
      saleUnit: "KG",
    });
  });

  it("finds a product by any of its barcodes", () => {
    addProduct("p1");
    addBarcode("p1", "111");
    addBarcode("p1", "222", true, 2);

    expect(readActiveProductByBarcode(database, "222")).toMatchObject({ id: "p1" });
  });

  it.each([
    ["a code that is only part of the barcode", "779123456789"],
    ["a code with another case", "abc-1"],
  ])("does not find the product by %s", (_case, code) => {
    addProduct("p1");
    addBarcode("p1", "7791234567890");
    addBarcode("p1", "ABC-1", true, 2);

    expect(readActiveProductByBarcode(database, code)).toBeUndefined();
  });

  it.each([
    ["an inactive product", { active: false }, true],
    ["a removed product", { removed: true }, true],
    ["an inactive barcode", {}, false],
  ])("does not find %s", (_case, options, barcodeActive) => {
    addProduct("p1", options);
    addBarcode("p1", "111", barcodeActive);

    expect(readActiveProductByBarcode(database, "111")).toBeUndefined();
  });
});

describe("reading an active product by its id", () => {
  it("finds it with its name and sale unit", () => {
    addProduct("p2", { name: "Queso", unit: "KG" });

    expect(readActiveProductById(database, "p2")).toEqual({
      id: "p2",
      name: "Queso",
      saleUnit: "KG",
    });
  });

  it.each([
    ["an inactive product", { active: false }],
    ["a removed product", { removed: true }],
  ])("does not find %s", (_case, options) => {
    addProduct("p2", options);

    expect(readActiveProductById(database, "p2")).toBeUndefined();
  });

  it("does not find an id no product has", () => {
    expect(readActiveProductById(database, "missing")).toBeUndefined();
  });
});

describe("the products a name search looks through", () => {
  function searchable() {
    return readSearchableProducts(database);
  }

  it("are the active products that were not removed, with their sale unit", () => {
    addProduct("p1", { name: "Yerba" });
    addProduct("p2", { name: "Queso", unit: "KG" });
    addProduct("p3", { name: "Retirado", active: false });
    addProduct("p4", { name: "Borrado", removed: true });

    expect(searchable()).toEqual([
      { id: "p1", name: "Yerba", saleUnit: "UNIT", timesSoldHere: 0 },
      { id: "p2", name: "Queso", saleUnit: "KG", timesSoldHere: 0 },
    ]);
  });

  it("count the completed sales of this register that contain them, once per sale", () => {
    addProduct("p1");
    addProduct("p2", { name: "Azucar" });
    addSale("s1", "COMPLETED", ["p1", "p2"]);
    addSale("s2", "COMPLETED", ["p1"]);

    expect(searchable().map(({ id, timesSoldHere }) => [id, timesSoldHere])).toEqual([
      ["p1", 2],
      ["p2", 1],
    ]);
  });

  it.each([
    ["an open sale", "OPEN", "register-1"],
    ["a voided sale", "VOIDED", "register-1"],
    ["a completed sale of another register", "COMPLETED", "register-2"],
  ])("do not count %s", (_case, state, registerId) => {
    addProduct("p1");
    addSale("s1", state, ["p1"], registerId);

    expect(searchable().map((product) => product.timesSoldHere)).toEqual([0]);
  });

  it("count nothing while the register has no identity yet", () => {
    addProduct("p1");
    addSale("s1", "COMPLETED", ["p1"]);
    database.prepare("DELETE FROM own_register").run();

    expect(searchable().map((product) => product.timesSoldHere)).toEqual([0]);
  });
});
