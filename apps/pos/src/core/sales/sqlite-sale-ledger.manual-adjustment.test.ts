import type { ManualAdjustment, SaleLine } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import type { SqliteSaleLedger } from "./sqlite-sale-ledger";
import { ledgerWithOpenSale } from "./test-support/sqlite-sale-ledger";

let database: LocalDatabase;
let ledger: SqliteSaleLedger;

function lineWith(manualAdjustment: ManualAdjustment | null): SaleLine {
  return {
    id: "line-1",
    productId: "p1",
    productName: "Yerba",
    saleUnit: "UNIT",
    weightSource: null,
    quantity: 2,
    listUnitPrice: 1500,
    priceListId: "list-1",
    promotions: [],
    manualAdjustment,
    promotionId: null,
    discountAmount: 0,
    lineTotal: 3000,
  };
}

function adjustmentColumns(): unknown {
  return database
    .prepare(
      `SELECT manual_adjustment_kind AS kind, manual_adjustment_value AS value,
              manual_adjustment_reason AS reason, manual_adjustment_authorized_by AS authorized_by
       FROM sale_lines`,
    )
    .get();
}

function readLine(): SaleLine | undefined {
  return ledger.transaction((tx) => tx.openSale("session-1"))?.lines[0];
}

const PRICE: ManualAdjustment = {
  kind: "PRICE",
  unitPrice: 1200,
  reason: "Golpeado",
  authorizedBy: null,
};
const PERCENT: ManualAdjustment = {
  kind: "PERCENT",
  percent: 15,
  reason: "Cliente frecuente",
  authorizedBy: "u2",
};
const AMOUNT: ManualAdjustment = {
  kind: "AMOUNT",
  amount: 250,
  reason: "Envase abierto",
  authorizedBy: "u3",
};
const ADJUSTMENTS: readonly [string, ManualAdjustment][] = [
  ["an overridden price", PRICE],
  ["a percentage", PERCENT],
  ["an amount", AMOUNT],
];

beforeEach(() => {
  ({ database, ledger } = ledgerWithOpenSale());
});

afterEach(() => {
  database.close();
});

describe("the sale ledger's manual adjustments", () => {
  it("stores no adjustment for a line that has none and reads it back without one", () => {
    ledger.transaction((tx) => tx.recordSaleLine("sale-1", lineWith(null)));

    expect(adjustmentColumns()).toEqual({
      kind: null,
      value: null,
      reason: null,
      authorized_by: null,
    });
    expect(readLine()?.manualAdjustment).toBeNull();
  });

  it.each(ADJUSTMENTS)(
    "keeps %s of a line added with it and reads it back",
    (_case, adjustment) => {
      ledger.transaction((tx) => tx.recordSaleLine("sale-1", lineWith(adjustment)));

      expect(readLine()?.manualAdjustment).toEqual(adjustment);
    },
  );

  it("stores the kind, the value, the reason and who authorized it in their columns", () => {
    ledger.transaction((tx) =>
      tx.recordSaleLine(
        "sale-1",
        lineWith({ kind: "PERCENT", percent: 15, reason: "Cliente frecuente", authorizedBy: "u2" }),
      ),
    );

    expect(adjustmentColumns()).toEqual({
      kind: "PERCENT",
      value: 15,
      reason: "Cliente frecuente",
      authorized_by: "u2",
    });
  });

  it("stores no authorizer when the cashier held the permission", () => {
    ledger.transaction((tx) =>
      tx.recordSaleLine(
        "sale-1",
        lineWith({ kind: "PRICE", unitPrice: 0, reason: "Muestra", authorizedBy: null }),
      ),
    );

    expect(adjustmentColumns()).toEqual({
      kind: "PRICE",
      value: 0,
      reason: "Muestra",
      authorized_by: null,
    });
  });

  it.each(ADJUSTMENTS)("records %s applied to a line already in the sale", (_case, adjustment) => {
    ledger.transaction((tx) => tx.recordSaleLine("sale-1", lineWith(null)));

    ledger.transaction((tx) => tx.recordChangedLine(lineWith(adjustment)));

    expect(readLine()?.manualAdjustment).toEqual(adjustment);
  });

  it("replaces the adjustment of a line with another", () => {
    ledger.transaction((tx) => tx.recordSaleLine("sale-1", lineWith(PRICE)));

    ledger.transaction((tx) => tx.recordChangedLine(lineWith(AMOUNT)));

    expect(readLine()?.manualAdjustment).toEqual(AMOUNT);
  });

  it("removes the adjustment of a line recorded without one", () => {
    ledger.transaction((tx) => tx.recordSaleLine("sale-1", lineWith(AMOUNT)));

    ledger.transaction((tx) => tx.recordChangedLine(lineWith(null)));

    expect(adjustmentColumns()).toEqual({
      kind: null,
      value: null,
      reason: null,
      authorized_by: null,
    });
    expect(readLine()?.manualAdjustment).toBeNull();
  });
});
