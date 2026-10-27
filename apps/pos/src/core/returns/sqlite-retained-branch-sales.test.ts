import type { BranchSaleFacts } from "@purosur/domain/returns/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { readRetainedBranchSale, SqliteRetainedBranchSales } from "./sqlite-retained-branch-sales";
import { openSoldSaleDatabase } from "./test-support/sold-sale-database";

const FACTS: BranchSaleFacts = {
  sale: {
    sale: {
      id: "sale-9",
      registerId: "register-2",
      deviceId: "device-2",
      sessionId: "session-2",
      actorId: "cashier",
      state: "COMPLETED",
      saleDiscount: { kind: "PERCENT", percent: 10, reason: "promo", authorizedBy: null },
      lines: [
        {
          id: "line-9",
          productId: "yerba",
          productName: "Yerba 1 kg",
          saleUnit: "UNIT",
          quantity: 3,
          promotionId: null,
          lineTotal: 7500,
        },
      ],
    },
    occurredAt: new Date("2026-09-12T18:30:00.000Z"),
    invoice: { pointOfSale: 3, number: 1204 },
    payments: [
      {
        id: "pay-9",
        method: "CASH",
        provider: "NONE",
        amount: 7500,
        state: "APPROVED",
        refundedAmount: 0,
      },
    ],
    returned: [],
  },
  goodConditionReturnDays: 15,
  countedReturnIds: ["return-1"],
};

let database: LocalDatabase;

beforeEach(() => {
  database = openSoldSaleDatabase();
});

afterEach(() => {
  database.close();
});

describe("the copy of a branch sale the cloud answered", () => {
  it("reads back what was kept for the sale, with its date as a date", () => {
    new SqliteRetainedBranchSales(database).keep(FACTS);

    expect(readRetainedBranchSale(database, "sale-9")).toEqual(FACTS);
  });

  it("holds nothing for a sale that was never kept", () => {
    expect(readRetainedBranchSale(database, "sale-9")).toBeUndefined();
  });

  it("replaces the copy when the same sale is kept again", () => {
    const retained = new SqliteRetainedBranchSales(database);
    retained.keep(FACTS);

    retained.keep({
      ...FACTS,
      goodConditionReturnDays: 30,
      countedReturnIds: ["return-1", "return-2"],
    });

    expect(readRetainedBranchSale(database, "sale-9")).toMatchObject({
      goodConditionReturnDays: 30,
      countedReturnIds: ["return-1", "return-2"],
    });
    expect(
      database
        .prepare<[], { total: number }>("SELECT count(*) AS total FROM branch_sales_for_return")
        .get()?.total,
    ).toBe(1);
  });

  it("keeps each sale apart", () => {
    const retained = new SqliteRetainedBranchSales(database);
    retained.keep(FACTS);
    retained.keep({
      ...FACTS,
      sale: { ...FACTS.sale, sale: { ...FACTS.sale.sale, id: "sale-10" } },
    });

    expect(readRetainedBranchSale(database, "sale-10")?.sale.sale.id).toBe("sale-10");
    expect(readRetainedBranchSale(database, "sale-9")?.sale.sale.id).toBe("sale-9");
  });
});
