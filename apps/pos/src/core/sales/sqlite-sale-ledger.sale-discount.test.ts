import type { SaleDiscount, SaleLine } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import type { SqliteSaleLedger } from "./sqlite-sale-ledger";
import { ledgerWithOpenSale } from "./test-support/sqlite-sale-ledger";

let database: LocalDatabase;
let ledger: SqliteSaleLedger;

function lineOf(id: string, lineTotal: number): SaleLine {
  return {
    id,
    productId: `product-${id}`,
    productName: "Yerba",
    saleUnit: "UNIT",
    weightSource: null,
    quantity: 1,
    listUnitPrice: lineTotal,
    priceListId: "list-1",
    promotions: [],
    manualAdjustment: null,
    promotionId: null,
    discountAmount: 0,
    lineTotal,
  };
}

function addLines(...totals: number[]): void {
  ledger.transaction((tx) => {
    totals.forEach((total, index) => {
      tx.recordSaleLine("sale-1", lineOf(`line-${index + 1}`, total));
    });
  });
}

function discount(saleDiscount: SaleDiscount | null): void {
  ledger.transaction((tx) => tx.recordSaleDiscount("sale-1", saleDiscount));
}

function saleColumns(): unknown {
  return database
    .prepare(
      `SELECT sale_discount_kind AS kind, sale_discount_value AS value,
              sale_discount_reason AS reason, sale_discount_authorized_by AS authorized_by
       FROM sales WHERE id = 'sale-1'`,
    )
    .get();
}

function openSale() {
  return ledger.transaction((tx) => tx.openSale("session-1"));
}

const NO_DISCOUNT = { kind: null, value: null, reason: null, authorized_by: null };

beforeEach(() => {
  ({ database, ledger } = ledgerWithOpenSale());
});

afterEach(() => {
  database.close();
});

describe("the sale ledger's discount on the sale's total", () => {
  it("reads a sale with no discount as having none", () => {
    addLines(1000);

    expect(saleColumns()).toEqual(NO_DISCOUNT);
    expect(openSale()?.saleDiscount).toBeNull();
  });

  it.each([
    [
      "a percentage",
      { kind: "PERCENT", percent: 15, reason: "Cliente frecuente", authorizedBy: "u2" },
    ],
    ["an amount", { kind: "AMOUNT", amount: 250, reason: "Envase abierto", authorizedBy: null }],
  ] as const)("keeps %s and reads it back", (_case, saleDiscount) => {
    addLines(1000, 2000);

    discount(saleDiscount);

    expect(openSale()?.saleDiscount).toEqual(saleDiscount);
  });

  it("stores the kind, the value, the reason and who authorized it", () => {
    addLines(1000, 2000);

    discount({ kind: "PERCENT", percent: 15, reason: "Cliente frecuente", authorizedBy: "u2" });

    expect(saleColumns()).toEqual({
      kind: "PERCENT",
      value: 15,
      reason: "Cliente frecuente",
      authorized_by: "u2",
    });
  });

  it("leaves the lines' own totals as they were", () => {
    addLines(3000, 1000);

    discount({ kind: "AMOUNT", amount: 400, reason: "Cliente frecuente", authorizedBy: null });

    expect(openSale()?.lines.map((line) => line.lineTotal)).toEqual([3000, 1000]);
  });

  it("replaces the discount a sale already has", () => {
    addLines(1000, 1000);
    discount({ kind: "AMOUNT", amount: 100, reason: "Primero", authorizedBy: "u2" });

    discount({ kind: "PERCENT", percent: 50, reason: "Segundo", authorizedBy: null });

    expect(saleColumns()).toEqual({
      kind: "PERCENT",
      value: 50,
      reason: "Segundo",
      authorized_by: null,
    });
  });

  it("removes the discount when it is recorded as none", () => {
    addLines(1000, 1000);
    discount({ kind: "AMOUNT", amount: 100, reason: "Cliente frecuente", authorizedBy: "u2" });

    discount(null);

    expect(saleColumns()).toEqual(NO_DISCOUNT);
    expect(openSale()?.saleDiscount).toBeNull();
  });

  it("changes only its own sale", () => {
    database.exec(
      `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
       VALUES ('sale-2', 'register-1', 'device-1', 'session-1', 'u1', 'COMPLETED', '2026-10-09T09:00:00.000Z');`,
    );
    addLines(1000);

    discount({ kind: "AMOUNT", amount: 100, reason: "Cliente frecuente", authorizedBy: null });

    expect(
      database.prepare("SELECT sale_discount_kind FROM sales WHERE id = 'sale-2'").get(),
    ).toEqual({ sale_discount_kind: null });
  });

  it("keeps the discount once the sale is completed", () => {
    addLines(1000, 1000);
    discount({ kind: "AMOUNT", amount: 101, reason: "Cliente frecuente", authorizedBy: "u2" });

    ledger.transaction((tx) =>
      tx.recordCompletedSale("sale-1", new Date("2026-10-09T09:00:00.000Z"), 1),
    );

    expect(saleColumns()).toMatchObject({ kind: "AMOUNT", value: 101 });
  });

  it("keeps the discount once the sale is cancelled", () => {
    addLines(1000, 1000);
    discount({ kind: "AMOUNT", amount: 101, reason: "Cliente frecuente", authorizedBy: "u2" });

    ledger.transaction((tx) =>
      tx.recordCancelledSale("sale-1", new Date("2026-10-09T09:00:00.000Z"), undefined),
    );

    expect(saleColumns()).toMatchObject({ kind: "AMOUNT", value: 101 });
  });
});
