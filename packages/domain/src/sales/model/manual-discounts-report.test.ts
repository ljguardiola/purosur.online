import { describe, expect, it } from "vitest";
import {
  type LineDiscountRecord,
  type ManualDiscountRecords,
  manualDiscountAuthorizers,
  manualDiscountRows,
  manualDiscountTotals,
  type SaleDiscountRecord,
} from "./manual-discounts-report.js";

const MOMENT = new Date("2026-10-06T14:00:00.000Z");

function saleDiscount(
  saleId: string,
  options: Partial<SaleDiscountRecord> = {},
): SaleDiscountRecord {
  return {
    saleId,
    operationNumber: 7,
    completedAt: MOMENT,
    actorId: "cashier-1",
    actorName: "Ana",
    authorizedBy: null,
    authorizedByName: null,
    reason: "Cliente frecuente",
    discount: { kind: "PERCENT", percent: 10 },
    amount: 500,
    ...options,
  };
}

function lineDiscount(
  saleId: string,
  lineId: string,
  options: Partial<LineDiscountRecord> = {},
): LineDiscountRecord {
  return {
    saleId,
    operationNumber: 7,
    completedAt: MOMENT,
    actorId: "cashier-1",
    actorName: "Ana",
    authorizedBy: null,
    authorizedByName: null,
    reason: "Envase dañado",
    lineId,
    productName: "Yerba 1 kg",
    quantity: 2,
    weightSource: null,
    listUnitPrice: 1_000,
    adjustment: { kind: "PERCENT", percent: 10 },
    ...options,
  };
}

function recordsOf(
  saleDiscounts: SaleDiscountRecord[] = [],
  lineDiscounts: LineDiscountRecord[] = [],
): ManualDiscountRecords {
  return { saleDiscounts, lineDiscounts };
}

describe("manualDiscountRows", () => {
  it("makes a sale row of a discount on the total with the amount it took off", () => {
    expect(manualDiscountRows(recordsOf([saleDiscount("s1")]))).toEqual([
      {
        saleId: "s1",
        operationNumber: 7,
        completedAt: MOMENT,
        kind: "SALE",
        lineId: null,
        productName: null,
        adjustment: { kind: "PERCENT", percent: 10 },
        reason: "Cliente frecuente",
        authorizer: { id: "cashier-1", name: "Ana" },
        discounted: 500,
      },
    ]);
  });

  it("makes a line row of a percent discount on a line, from its list price and quantity", () => {
    expect(manualDiscountRows(recordsOf([], [lineDiscount("s1", "l1")]))).toEqual([
      {
        saleId: "s1",
        operationNumber: 7,
        completedAt: MOMENT,
        kind: "LINE",
        lineId: "l1",
        productName: "Yerba 1 kg",
        adjustment: { kind: "PERCENT", percent: 10 },
        reason: "Envase dañado",
        authorizer: { id: "cashier-1", name: "Ana" },
        discounted: 200,
      },
    ]);
  });

  it("takes an amount discount on a line as the amount it took off", () => {
    const [row] = manualDiscountRows(
      recordsOf([], [lineDiscount("s1", "l1", { adjustment: { kind: "AMOUNT", amount: 350 } })]),
    );

    expect(row?.discounted).toBe(350);
  });

  it("takes a new price on a line as the difference with the list price of everything sold", () => {
    const [row] = manualDiscountRows(
      recordsOf(
        [],
        [lineDiscount("s1", "l1", { adjustment: { kind: "PRICE", unitPrice: 800 }, quantity: 3 })],
      ),
    );

    expect(row).toMatchObject({ adjustment: { kind: "PRICE", unitPrice: 800 }, discounted: 600 });
  });

  it("prices a line sold by weight from its thousandths of a kilogram", () => {
    const [row] = manualDiscountRows(
      recordsOf(
        [],
        [
          lineDiscount("s1", "l1", {
            weightSource: "SCALE",
            quantity: 1_500,
            listUnitPrice: 2_000,
            adjustment: { kind: "PERCENT", percent: 50 },
          }),
        ],
      ),
    );

    expect(row?.discounted).toBe(1_500);
  });

  it.each([
    ["kept the list price", 1_000],
    ["raised the price", 1_200],
  ])("leaves out a new price that %s", (_name, unitPrice) => {
    expect(
      manualDiscountRows(
        recordsOf([], [lineDiscount("s1", "l1", { adjustment: { kind: "PRICE", unitPrice } })]),
      ),
    ).toEqual([]);
  });

  it("keeps a new price that lowered the price by a cent", () => {
    expect(
      manualDiscountRows(
        recordsOf(
          [],
          [
            lineDiscount("s1", "l1", {
              adjustment: { kind: "PRICE", unitPrice: 999 },
              quantity: 1,
            }),
          ],
        ),
      ).map((row) => row.discounted),
    ).toEqual([1]);
  });

  describe("who authorized", () => {
    it("is the person who authorized the discount", () => {
      const [sale, line] = manualDiscountRows(
        recordsOf(
          [saleDiscount("s1", { authorizedBy: "boss", authorizedByName: "Beto" })],
          [lineDiscount("s2", "l1", { authorizedBy: "boss", authorizedByName: "Beto" })],
        ),
      );

      expect([sale?.authorizer, line?.authorizer]).toEqual([
        { id: "boss", name: "Beto" },
        { id: "boss", name: "Beto" },
      ]);
    });

    it("is the cashier when nobody else authorized it, because the cashier had the permission", () => {
      const rows = manualDiscountRows(
        recordsOf(
          [saleDiscount("s1", { actorId: "c2", actorName: "Carla" })],
          [lineDiscount("s2", "l1", { actorId: "c3", actorName: null })],
        ),
      );

      expect(rows.map((row) => row.authorizer)).toEqual(
        expect.arrayContaining([
          { id: "c2", name: "Carla" },
          { id: "c3", name: null },
        ]),
      );
    });

    it("has no name when the person who authorized it is unknown, even if the cashier is named", () => {
      const [row] = manualDiscountRows(
        recordsOf([saleDiscount("s1", { authorizedBy: "gone", authorizedByName: null })]),
      );

      expect(row?.authorizer).toEqual({ id: "gone", name: null });
    });
  });

  describe("order", () => {
    it("puts the most recent sale first", () => {
      const rows = manualDiscountRows(
        recordsOf([
          saleDiscount("old", { completedAt: new Date("2026-10-05T10:00:00.000Z") }),
          saleDiscount("new", { completedAt: new Date("2026-10-06T10:00:00.000Z") }),
          saleDiscount("mid", { completedAt: new Date("2026-10-05T18:00:00.000Z") }),
        ]),
      );

      expect(rows.map((row) => row.saleId)).toEqual(["new", "mid", "old"]);
    });

    it("orders the discounts of one instant by sale id, comparing code units", () => {
      const rows = manualDiscountRows(
        recordsOf([saleDiscount("a1"), saleDiscount("B1"), saleDiscount("a0")]),
      );

      expect(rows.map((row) => row.saleId)).toEqual(["B1", "a0", "a1"]);
    });

    it("puts the discount on the total of a sale before the discounts of its lines", () => {
      const rows = manualDiscountRows(
        recordsOf([saleDiscount("s1")], [lineDiscount("s1", "l1"), lineDiscount("s0", "l0")]),
      );

      expect(rows.map((row) => [row.saleId, row.kind])).toEqual([
        ["s0", "LINE"],
        ["s1", "SALE"],
        ["s1", "LINE"],
      ]);
    });

    it("orders the lines of a sale by line id, comparing code units", () => {
      const rows = manualDiscountRows(
        recordsOf([], [lineDiscount("s1", "b"), lineDiscount("s1", "a"), lineDiscount("s1", "C")]),
      );

      expect(rows.map((row) => row.lineId)).toEqual(["C", "a", "b"]);
    });

    it("orders the same whatever order the records arrive in", () => {
      const saleDiscounts = [saleDiscount("s1"), saleDiscount("s2", { completedAt: new Date(0) })];
      const lineDiscounts = [lineDiscount("s1", "l1"), lineDiscount("s1", "l2")];

      expect(
        manualDiscountRows(recordsOf([...saleDiscounts].reverse(), [...lineDiscounts].reverse())),
      ).toEqual(manualDiscountRows(recordsOf(saleDiscounts, lineDiscounts)));
    });
  });
});

describe("manualDiscountAuthorizers", () => {
  it("lists each person who authorized a discount once, ordered by name and then id", () => {
    const rows = manualDiscountRows(
      recordsOf([
        saleDiscount("s1", { actorId: "z", actorName: "Ana" }),
        saleDiscount("s2", { actorId: "y", actorName: "Ana" }),
        saleDiscount("s3", { actorId: "y", actorName: "Ana" }),
        saleDiscount("s4", { actorId: "x", actorName: "Beto" }),
        saleDiscount("s5", { actorId: "w", actorName: null }),
        saleDiscount("s6", { actorId: "v", actorName: null }),
      ]),
    );

    expect(manualDiscountAuthorizers(rows)).toEqual([
      { id: "y", name: "Ana" },
      { id: "z", name: "Ana" },
      { id: "x", name: "Beto" },
      { id: "v", name: null },
      { id: "w", name: null },
    ]);
  });

  it("lists nobody without discounts", () => {
    expect(manualDiscountAuthorizers([])).toEqual([]);
  });
});

describe("manualDiscountTotals", () => {
  it("adds the amount discounted and counts the discounts of each kind", () => {
    const rows = manualDiscountRows(
      recordsOf(
        [saleDiscount("s1", { amount: 500 }), saleDiscount("s2", { amount: 300 })],
        [lineDiscount("s1", "l1")],
      ),
    );

    expect(manualDiscountTotals(rows)).toMatchObject({
      discounted: 1_000,
      count: 3,
      saleCount: 2,
      lineCount: 1,
    });
  });

  it("names the person with most discounts", () => {
    const rows = manualDiscountRows(
      recordsOf([
        saleDiscount("s1", { actorId: "a", actorName: "Ana", amount: 100 }),
        saleDiscount("s2", { actorId: "b", actorName: "Beto", amount: 900 }),
        saleDiscount("s3", { actorId: "a", actorName: "Ana", amount: 100 }),
      ]),
    );

    expect(manualDiscountTotals(rows).mostAuthorized).toEqual({ id: "a", name: "Ana", count: 2 });
  });

  it("counts a discount to the person who authorized it, not to the cashier", () => {
    const rows = manualDiscountRows(
      recordsOf([
        saleDiscount("s1", { authorizedBy: "boss", authorizedByName: "Beto" }),
        saleDiscount("s2", { authorizedBy: "boss", authorizedByName: "Beto" }),
        saleDiscount("s3", { actorId: "a", actorName: "Ana" }),
      ]),
    );

    expect(manualDiscountTotals(rows).mostAuthorized).toEqual({
      id: "boss",
      name: "Beto",
      count: 2,
    });
  });

  it("breaks a tie of discounts in favour of the larger amount discounted", () => {
    const rows = manualDiscountRows(
      recordsOf([
        saleDiscount("s1", { actorId: "a", actorName: "Ana", amount: 100 }),
        saleDiscount("s2", { actorId: "b", actorName: "Beto", amount: 900 }),
        saleDiscount("s3", { actorId: "c", actorName: "Carla", amount: 500 }),
      ]),
    );

    expect(manualDiscountTotals(rows).mostAuthorized?.id).toBe("b");
  });

  it("breaks a tie of discounts and amount by name, comparing code units and a missing name last", () => {
    const rows = manualDiscountRows(
      recordsOf([
        saleDiscount("s1", { actorId: "a", actorName: null }),
        saleDiscount("s2", { actorId: "b", actorName: "Zoe" }),
        saleDiscount("s3", { actorId: "c", actorName: "Ana" }),
      ]),
    );

    expect(manualDiscountTotals(rows).mostAuthorized?.id).toBe("c");
  });

  it("breaks the last tie by id, whatever order the rows arrive in", () => {
    const records = [
      saleDiscount("s1", { actorId: "b", actorName: "Ana" }),
      saleDiscount("s2", { actorId: "a", actorName: "Ana" }),
    ];

    expect(manualDiscountTotals(manualDiscountRows(recordsOf(records))).mostAuthorized?.id).toBe(
      "a",
    );
    expect(
      manualDiscountTotals(manualDiscountRows(recordsOf([...records].reverse()))).mostAuthorized
        ?.id,
    ).toBe("a");
  });

  it("totals nothing and names nobody without discounts", () => {
    expect(manualDiscountTotals([])).toEqual({
      discounted: 0,
      count: 0,
      lineCount: 0,
      saleCount: 0,
      mostAuthorized: null,
    });
  });
});
