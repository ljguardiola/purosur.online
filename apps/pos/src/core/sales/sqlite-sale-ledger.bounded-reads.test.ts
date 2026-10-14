import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import type { SqliteSaleLedger } from "./sqlite-sale-ledger";
import { ledgerWithOpenSale } from "./test-support/sqlite-sale-ledger";

let database: LocalDatabase;
let ledger: SqliteSaleLedger;

interface ReadStatement {
  source: string;
  parameters: unknown[];
  rows: number;
}

function reading<T>(run: () => T): { result: T; statements: ReadStatement[] } {
  const statements: ReadStatement[] = [];
  const prepare = database.prepare.bind(database);
  const spy = vi.spyOn(database, "prepare").mockImplementation((source: string) => {
    const statement = prepare(source);
    const all = statement.all.bind(statement);
    statement.all = (...parameters: unknown[]) => {
      const rows = all(...parameters);
      statements.push({ source, parameters, rows: rows.length });
      return rows;
    };
    return statement;
  });
  try {
    return { result: run(), statements };
  } finally {
    spy.mockRestore();
  }
}

function rowsReadFrom(table: string, statements: readonly ReadStatement[]): number {
  return statements
    .filter(({ source }) => source.includes(`FROM ${table}`))
    .reduce((total, { rows }) => total + rows, 0);
}

function planOf(statement: ReadStatement): string {
  return database
    .prepare<unknown[], { detail: string }>(`EXPLAIN QUERY PLAN ${statement.source}`)
    .all(...statement.parameters)
    .map(({ detail }) => detail)
    .join("\n");
}

function addProduct(id: string, categoryId = "own"): void {
  database
    .prepare(
      `INSERT INTO products (id, name, category_id, sale_unit, active, version)
       VALUES (?, ?, ?, 'UNIT', 1, 1)`,
    )
    .run(id, id, categoryId);
}

function addPrice(
  id: string,
  productId: string,
  validFrom: string,
  unitPrice: number,
  options: { removed?: boolean } = {},
): void {
  database
    .prepare(
      `INSERT INTO prices (id, product_id, price_list_id, unit_price, valid_from, version, removed)
       VALUES (?, ?, 'list-1', ?, ?, 1, ?)`,
    )
    .run(id, productId, unitPrice, validFrom, options.removed ? 1 : 0);
}

function addCategory(id: string, parentId: string | null): void {
  database
    .prepare("INSERT INTO categories (id, name, parent_id, version) VALUES (?, ?, ?, 1)")
    .run(id, id, parentId);
}

function addDiscount(id: string, kind: "PRODUCT" | "CATEGORY" | "TAG", targetId: string): void {
  database
    .prepare(
      `INSERT INTO discounts (
         id, name, kind, percent, target_kind, target_id, valid_from, valid_to, weekdays, active,
         version
       ) VALUES (?, 'Promo', 'PERCENT_OFF', 10, ?, ?, '2026-09-01', '2026-12-31', '[]', 1, 1)`,
    )
    .run(id, kind, targetId);
}

function addTag(productId: string, tagId: string, active = true): void {
  database
    .prepare("INSERT INTO product_tags (product_id, tag_id, active) VALUES (?, ?, ?)")
    .run(productId, tagId, active ? 1 : 0);
}

function currentPriceOf(productId: string) {
  return reading(() => ledger.transaction((tx) => tx.currentPrice(productId)));
}

function promotionsFor(productId: string) {
  const { result, statements } = reading(() =>
    ledger.transaction((tx) => tx.promotionsTargeting(productId)),
  );
  return { ids: result.map(({ id }) => id), statements };
}

beforeEach(() => {
  ({ database, ledger } = ledgerWithOpenSale());
  addCategory("root", null);
  addCategory("middle", "root");
  addCategory("own", "middle");
  addProduct("p1");
});

afterEach(() => {
  database.close();
});

describe("the sale ledger's current price of a product", () => {
  it("reads only the price that starts last out of a long history", () => {
    for (let month = 1; month <= 9; month += 1) {
      addPrice(`old-${month}`, "p1", `2025-0${month}-01T00:00:00.000Z`, 100 + month);
    }
    addPrice("newest", "p1", "2026-09-01T00:00:00.000Z", 500);
    addProduct("p2");
    addPrice("other-product", "p2", "2026-10-01T00:00:00.000Z", 900);

    const { result, statements } = currentPriceOf("p1");

    expect(result).toEqual({ priceListId: "list-1", unitPrice: 500 });
    expect(rowsReadFrom("prices", statements)).toBe(1);
  });

  it("reads every price that starts at the same moment and answers the one with the greater id", () => {
    addPrice("a", "p1", "2026-09-01T00:00:00.000Z", 100);
    addPrice("c", "p1", "2026-09-01T00:00:00.000Z", 300);
    addPrice("b", "p1", "2026-09-01T00:00:00.000Z", 200);
    addPrice("older", "p1", "2026-08-01T00:00:00.000Z", 50);

    const { result, statements } = currentPriceOf("p1");

    expect(result).toEqual({ priceListId: "list-1", unitPrice: 300 });
    expect(rowsReadFrom("prices", statements)).toBe(3);
  });

  it("answers the newest price that is not removed, reading none beyond it", () => {
    addPrice("kept", "p1", "2026-08-01T00:00:00.000Z", 400);
    addPrice("older", "p1", "2026-07-01T00:00:00.000Z", 300);
    addPrice("removed", "p1", "2026-09-01T00:00:00.000Z", 600, { removed: true });

    const { result, statements } = currentPriceOf("p1");

    expect(result).toEqual({ priceListId: "list-1", unitPrice: 400 });
    expect(rowsReadFrom("prices", statements)).toBe(1);
  });

  it("has no price for a product with none", () => {
    expect(currentPriceOf("p1").result).toBeUndefined();
  });

  it("looks the prices up by the product instead of scanning the table", () => {
    addPrice("only", "p1", "2026-09-01T00:00:00.000Z", 100);

    const plans = currentPriceOf("p1")
      .statements.filter(({ source }) => source.includes("FROM prices"))
      .map(planOf)
      .join("\n");

    expect(plans).toMatch(/SEARCH prices USING (COVERING )?INDEX/);
    expect(plans).not.toMatch(/SCAN prices/);
  });
});

describe("the sale ledger's promotions targeting a product", () => {
  it("reads only the discounts aimed at the product, its category chain and its active tags", () => {
    addTag("p1", "on");
    addTag("p1", "off", false);
    addProduct("p2");
    addCategory("sibling", "middle");
    addCategory("below", "own");
    addDiscount("d-product", "PRODUCT", "p1");
    addDiscount("d-own", "CATEGORY", "own");
    addDiscount("d-root", "CATEGORY", "root");
    addDiscount("d-tag", "TAG", "on");
    addDiscount("x-product", "PRODUCT", "p2");
    addDiscount("x-sibling", "CATEGORY", "sibling");
    addDiscount("x-below", "CATEGORY", "below");
    addDiscount("x-tag-off", "TAG", "off");
    addDiscount("x-tag-other", "TAG", "other");
    addDiscount("x-same-id-other-kind", "TAG", "p1");

    const { ids, statements } = promotionsFor("p1");

    expect(ids).toEqual(["d-own", "d-product", "d-root", "d-tag"]);
    expect(rowsReadFrom("discounts", statements)).toBe(4);
  });

  it("leaves out a removed discount", () => {
    addDiscount("gone", "PRODUCT", "p1");
    database.prepare("UPDATE discounts SET removed = 1 WHERE id = 'gone'").run();

    expect(promotionsFor("p1").ids).toEqual([]);
  });

  it("reads only the categories from the product's up to the root", () => {
    addCategory("sibling", "middle");
    addCategory("below", "own");

    const { statements } = promotionsFor("p1");

    expect(rowsReadFrom("categories", statements)).toBe(3);
  });

  it("keeps the discounts of its own category when that category is missing from the tree", () => {
    addProduct("p3", "unlisted");
    addDiscount("d-unlisted", "CATEGORY", "unlisted");

    expect(promotionsFor("p3").ids).toEqual(["d-unlisted"]);
  });

  it("still answers when a corrupt parent chain loops back on itself", () => {
    database.prepare("UPDATE categories SET parent_id = 'middle' WHERE id = 'own'").run();
    database.prepare("UPDATE categories SET parent_id = 'own' WHERE id = 'middle'").run();
    addDiscount("d-middle", "CATEGORY", "middle");
    addDiscount("d-root", "CATEGORY", "root");

    const { ids, statements } = promotionsFor("p1");

    expect(ids).toEqual(["d-middle"]);
    expect(rowsReadFrom("categories", statements)).toBeLessThanOrEqual(2);
  });

  it("looks the discounts up by what they target instead of scanning the table", () => {
    addDiscount("d-product", "PRODUCT", "p1");

    const plans = promotionsFor("p1")
      .statements.filter(({ source }) => source.includes("FROM discounts"))
      .map(planOf)
      .join("\n");

    expect(plans).toMatch(/SEARCH discounts USING (COVERING )?INDEX/);
    expect(plans).not.toMatch(/SCAN discounts/);
  });
});
