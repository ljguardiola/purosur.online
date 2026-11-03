import { describe, expect, it } from "vitest";
import { databaseWithSalesBefore } from "./test-support/sales-before-voided-by-migration.js";

describe("the sale cash rounding migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("reads a sale recorded before the rounding existed as rounded by nothing", async () => {
    const { database, insertSale } = await databaseWithSalesBefore("_sale_cash_rounding");
    const completedSale = await insertSale("COMPLETED");
    const voidedSale = await insertSale("VOIDED");

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query("select id, cash_rounding from sales order by id");
    expect(rows).toEqual(
      [completedSale, voidedSale]
        .sort()
        .map((id) => ({ id, cash_rounding: 0 })),
    );
  });

  it.each([
    ["the smallest cash bill", 10000],
    ["a negative amount", -1],
  ])("refuses a sale rounded by %s", async (_case, cashRounding) => {
    const { database, insertSale } = await databaseWithSalesBefore("_sale_cash_rounding");
    const completedSale = await insertSale("COMPLETED");
    const migrated = await database.applyMigration();

    await expect(
      migrated.query("update sales set cash_rounding = $2 where id = $1", [
        completedSale,
        cashRounding,
      ]),
    ).rejects.toThrow(/sales_cash_rounding_check/);
  });

  it("keeps a sale rounded by up to a cent short of the smallest cash bill", async () => {
    const { database, insertSale } = await databaseWithSalesBefore("_sale_cash_rounding");
    const completedSale = await insertSale("COMPLETED");
    const migrated = await database.applyMigration();

    await migrated.query("update sales set cash_rounding = 9999 where id = $1", [completedSale]);

    const { rows } = await migrated.query("select cash_rounding from sales where id = $1", [
      completedSale,
    ]);
    expect(rows).toEqual([{ cash_rounding: 9999 }]);
  });
});
