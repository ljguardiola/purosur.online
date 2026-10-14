import type { DiscountBenefit } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import type { SqliteSaleLedger } from "./sqlite-sale-ledger";
import {
  addCategory,
  addDiscount,
  addPrice,
  addProduct,
  addProductTag,
  ledgerWithOpenSale,
  promotionIdsTargeting,
} from "./test-support/sqlite-sale-ledger";

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

function currentPriceOf(productId: string) {
  return reading(() => ledger.transaction((tx) => tx.currentPrice(productId)));
}

const tenPercent: DiscountBenefit = { kind: "PERCENT_OFF", percent: 10 };

function promotionsFor(productId: string) {
  const { result, statements } = reading(() => promotionIdsTargeting(ledger, productId));
  return { ids: result, statements };
}

beforeEach(() => {
  ({ database, ledger } = ledgerWithOpenSale());
  addCategory(database, "root", null);
  addCategory(database, "middle", "root");
  addCategory(database, "own", "middle");
  addProduct(database, undefined, { categoryId: "own" });
});

afterEach(() => {
  database.close();
});

describe("the sale ledger's current price of a product", () => {
  it("reads only the price that starts last out of a long history", () => {
    for (let month = 1; month <= 9; month += 1) {
      addPrice(database, "p1", `2025-0${month}-01T00:00:00.000Z`, 100 + month, {
        id: `old-${month}`,
      });
    }
    addPrice(database, "p1", "2026-09-01T00:00:00.000Z", 500, { id: "newest" });
    addProduct(database, undefined, { id: "p2", categoryId: "own" });
    addPrice(database, "p2", "2026-10-01T00:00:00.000Z", 900, { id: "other-product" });

    const { result, statements } = currentPriceOf("p1");

    expect(result).toEqual({ priceListId: "list-1", unitPrice: 500 });
    expect(rowsReadFrom("prices", statements)).toBe(1);
  });

  it("reads every price that starts at the same moment and answers the one with the greater id", () => {
    addPrice(database, "p1", "2026-09-01T00:00:00.000Z", 100, { id: "a" });
    addPrice(database, "p1", "2026-09-01T00:00:00.000Z", 300, { id: "c" });
    addPrice(database, "p1", "2026-09-01T00:00:00.000Z", 200, { id: "b" });
    addPrice(database, "p1", "2026-08-01T00:00:00.000Z", 50, { id: "older" });

    const { result, statements } = currentPriceOf("p1");

    expect(result).toEqual({ priceListId: "list-1", unitPrice: 300 });
    expect(rowsReadFrom("prices", statements)).toBe(3);
  });

  it("answers the newest price that is not removed, reading none beyond it", () => {
    addPrice(database, "p1", "2026-08-01T00:00:00.000Z", 400, { id: "kept" });
    addPrice(database, "p1", "2026-07-01T00:00:00.000Z", 300, { id: "older" });
    addPrice(database, "p1", "2026-09-01T00:00:00.000Z", 600, { id: "removed", removed: true });

    const { result, statements } = currentPriceOf("p1");

    expect(result).toEqual({ priceListId: "list-1", unitPrice: 400 });
    expect(rowsReadFrom("prices", statements)).toBe(1);
  });

  it("looks the prices up by the product and the moment they start instead of scanning the table", () => {
    addPrice(database, "p1", "2026-09-01T00:00:00.000Z", 100, { id: "only" });

    const plans = currentPriceOf("p1")
      .statements.filter(({ source }) => source.includes("FROM prices"))
      .map(planOf)
      .join("\n");

    expect(plans).toMatch(
      /SEARCH prices USING (COVERING )?INDEX prices_by_product_and_start \(product_id=\? AND valid_from=\?\)/,
    );
    expect(plans).not.toMatch(/SCAN prices/);
  });
});

describe("the sale ledger's promotions targeting a product", () => {
  it("reads only the discounts aimed at the product, its category chain and its active tags", () => {
    addProductTag(database, "p1", "on");
    addProductTag(database, "p1", "off", false);
    addProduct(database, undefined, { id: "p2", categoryId: "own" });
    addCategory(database, "sibling", "middle");
    addCategory(database, "below", "own");
    addDiscount(database, "d-product", { kind: "PRODUCT", id: "p1" }, tenPercent);
    addDiscount(database, "d-own", { kind: "CATEGORY", id: "own" }, tenPercent);
    addDiscount(database, "d-root", { kind: "CATEGORY", id: "root" }, tenPercent);
    addDiscount(database, "d-tag", { kind: "TAG", id: "on" }, tenPercent);
    addDiscount(database, "x-product", { kind: "PRODUCT", id: "p2" }, tenPercent);
    addDiscount(database, "x-sibling", { kind: "CATEGORY", id: "sibling" }, tenPercent);
    addDiscount(database, "x-below", { kind: "CATEGORY", id: "below" }, tenPercent);
    addDiscount(database, "x-tag-off", { kind: "TAG", id: "off" }, tenPercent);
    addDiscount(database, "x-tag-other", { kind: "TAG", id: "other" }, tenPercent);
    addDiscount(database, "x-same-id-other-kind", { kind: "TAG", id: "p1" }, tenPercent);

    const { ids, statements } = promotionsFor("p1");

    expect(ids).toEqual(["d-own", "d-product", "d-root", "d-tag"]);
    expect(rowsReadFrom("discounts", statements)).toBe(4);
  });

  it("reads only the categories from the product's up to the root", () => {
    addCategory(database, "sibling", "middle");
    addCategory(database, "below", "own");

    const { statements } = promotionsFor("p1");

    expect(rowsReadFrom("categories", statements)).toBe(3);
  });

  it("keeps the discounts of its own category when that category is missing from the tree", () => {
    addProduct(database, undefined, { id: "p3", categoryId: "unlisted" });
    addDiscount(database, "d-unlisted", { kind: "CATEGORY", id: "unlisted" }, tenPercent);

    expect(promotionsFor("p3").ids).toEqual(["d-unlisted"]);
  });

  it("still answers when a corrupt parent chain loops back on itself", () => {
    database.prepare("UPDATE categories SET parent_id = 'middle' WHERE id = 'own'").run();
    database.prepare("UPDATE categories SET parent_id = 'own' WHERE id = 'middle'").run();
    addDiscount(database, "d-middle", { kind: "CATEGORY", id: "middle" }, tenPercent);
    addDiscount(database, "d-root", { kind: "CATEGORY", id: "root" }, tenPercent);

    const { ids, statements } = promotionsFor("p1");

    expect(ids).toEqual(["d-middle"]);
    expect(rowsReadFrom("categories", statements)).toBeLessThanOrEqual(2);
  });

  it("looks the discounts up by what they target instead of scanning the table", () => {
    addDiscount(database, "d-product", { kind: "PRODUCT", id: "p1" }, tenPercent);

    const plans = promotionsFor("p1")
      .statements.filter(({ source }) => source.includes("FROM discounts"))
      .map(planOf)
      .join("\n");

    expect(plans).toMatch(/SEARCH discounts USING (COVERING )?INDEX/);
    expect(plans).not.toMatch(/SCAN discounts/);
  });
});
