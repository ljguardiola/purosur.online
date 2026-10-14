import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

describe("the buy-N-pay-M migration applied to a database that already holds discounts", {
  timeout: 30_000,
}, () => {
  it("keeps every percent-off discount as it was, with no quantities", async () => {
    const database = await databaseBeforeMigration("_buy_n_pay_m_discounts");

    const { rows: categoryRows } = await database.query<{ id: string }>(
      "insert into categories (name) values ($1) returning id",
      ["Infusiones"],
    );
    const category = categoryRows[0];
    if (!category) {
      throw new Error("test setup: seeding the category returned no row");
    }
    const { rows: discountRows } = await database.query<{ id: string }>(
      `insert into discounts (name, kind, percent, category_id, valid_from, valid_to, weekdays)
       values ($1, 'PERCENT_OFF', 10, $2, '2026-10-01', '2026-10-31', '{2}') returning id`,
      ["Martes de infusiones", category.id],
    );
    const seededDiscount = discountRows[0];
    if (!seededDiscount) {
      throw new Error("test setup: seeding the discount returned no row");
    }

    const migrated = await database.applyMigration();

    expect(
      (
        await migrated.query(
          `select id, kind, percent, buy_qty as "buyQty", pay_qty as "payQty", category_id as "categoryId"
             from discounts`,
        )
      ).rows,
    ).toEqual([
      {
        id: seededDiscount.id,
        kind: "PERCENT_OFF",
        percent: 10,
        buyQty: null,
        payQty: null,
        categoryId: category.id,
      },
    ]);
  });
});
