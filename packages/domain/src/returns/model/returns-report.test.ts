import { describe, expect, it } from "vitest";
import {
  type ReturnRecord,
  type ReturnRecordLine,
  returnRows,
  returnsReportGroups,
  returnsReportTotals,
  type VoidedSaleRecord,
  voidedSalesGroup,
  voidsAndReturnsByAuthorizer,
  voidsAndReturnsByCashier,
} from "./returns-report.js";

function line(overrides: Partial<ReturnRecordLine> = {}): ReturnRecordLine {
  return {
    saleLineId: "l1",
    productName: "Yerba 1 kg",
    saleUnit: "UNIT",
    quantity: 1,
    reason: "change_of_mind",
    disposition: "restock",
    resolution: "refund",
    refunded: 1_000,
    ...overrides,
  };
}

function voided(overrides: Partial<VoidedSaleRecord> = {}): VoidedSaleRecord {
  return {
    sale: { id: "v1", operationNumber: 20, invoice: null },
    voidedAt: new Date("2026-10-06T14:00:00.000Z"),
    register: { id: "reg-1", name: "Caja 1" },
    cashier: { id: "ana", name: "Ana" },
    authorizer: null,
    total: 5_000,
    ...overrides,
  };
}

function record(overrides: Partial<ReturnRecord> = {}): ReturnRecord {
  return {
    returnId: "r1",
    occurredAt: new Date("2026-10-06T14:00:00.000Z"),
    ticketSource: "QR",
    register: { id: "reg-1", name: "Caja 1" },
    sale: { id: "s1", operationNumber: 12, invoice: { pointOfSale: 3, number: 45 } },
    cashier: { id: "ana", name: "Ana" },
    authorizer: null,
    lines: [line()],
    ...overrides,
  };
}

describe("returnRows", () => {
  it("adds up the refunded amount of a return's lines", () => {
    const [row] = returnRows([
      record({ lines: [line({ refunded: 1_000 }), line({ saleLineId: "l2", refunded: 250 })] }),
    ]);

    expect(row?.refunded).toBe(1_250);
  });

  it("keeps everything else the record says", () => {
    const original = record({ authorizer: { id: "beto", name: "Beto" } });

    expect(returnRows([original])).toEqual([{ ...original, refunded: 1_000 }]);
  });

  it("lists the newest return first and breaks a tie by return id", () => {
    const older = record({ returnId: "z", occurredAt: new Date("2026-10-06T10:00:00.000Z") });
    const newer = record({ returnId: "m", occurredAt: new Date("2026-10-06T11:00:00.000Z") });
    const tiedFirst = record({ returnId: "a", occurredAt: new Date("2026-10-06T11:00:00.000Z") });

    expect(returnRows([older, newer, tiedFirst]).map((row) => row.returnId)).toEqual([
      "a",
      "m",
      "z",
    ]);
  });

  it.each([
    ["a", "b"],
    ["b", "a"],
  ])(
    "breaks a tie by return id whichever order the records come in (%s then %s)",
    (first, second) => {
      const moment = new Date("2026-10-06T10:00:00.000Z");

      const rows = returnRows([
        record({ returnId: first, occurredAt: moment }),
        record({ returnId: second, occurredAt: moment }),
      ]);

      expect(rows.map((row) => row.returnId)).toEqual(["a", "b"]);
    },
  );

  it("breaks a tie between return ids differing in case by their code units", () => {
    const moment = new Date("2026-10-06T10:00:00.000Z");

    const rows = returnRows([
      record({ returnId: "a", occurredAt: moment }),
      record({ returnId: "B", occurredAt: moment }),
    ]);

    expect(rows.map((row) => row.returnId)).toEqual(["B", "a"]);
  });

  it("does not reorder the records it is given", () => {
    const records = [
      record({ returnId: "a", occurredAt: new Date("2026-10-06T10:00:00.000Z") }),
      record({ returnId: "b", occurredAt: new Date("2026-10-06T11:00:00.000Z") }),
    ];

    returnRows(records);

    expect(records.map((entry) => entry.returnId)).toEqual(["a", "b"]);
  });
});

describe("returnsReportGroups", () => {
  const scanned = record({ returnId: "q1", ticketSource: "QR", lines: [line({ refunded: 700 })] });
  const otherScanned = record({
    returnId: "q2",
    ticketSource: "QR",
    occurredAt: new Date("2026-10-06T15:00:00.000Z"),
    lines: [line({ refunded: 300 })],
  });
  const typed = record({ returnId: "t1", ticketSource: "TYPED", lines: [line({ refunded: 450 })] });

  it("keeps the returns started by typing the ticket apart from the scanned ones", () => {
    const groups = returnsReportGroups([scanned, typed, otherScanned]);

    expect(groups.typed.rows.map((row) => row.returnId)).toEqual(["t1"]);
    expect(groups.scanned.rows.map((row) => row.returnId)).toEqual(["q2", "q1"]);
  });

  it("totals the returns and the refunded amount of each group on its own", () => {
    const groups = returnsReportGroups([scanned, typed, otherScanned]);

    expect(groups.typed.totals).toEqual({ returns: 1, refunded: 450 });
    expect(groups.scanned.totals).toEqual({ returns: 2, refunded: 1_000 });
  });

  it("totals nothing for a group without returns", () => {
    const groups = returnsReportGroups([]);

    expect(groups.typed).toEqual({ rows: [], totals: { returns: 0, refunded: 0 } });
    expect(groups.scanned).toEqual({ rows: [], totals: { returns: 0, refunded: 0 } });
  });
});

describe("voidedSalesGroup", () => {
  it("lists the newest voided sale first and breaks a tie by sale id in code units", () => {
    const moment = new Date("2026-10-06T11:00:00.000Z");
    const older = voided({
      sale: { id: "z", operationNumber: null, invoice: null },
      voidedAt: new Date("2026-10-06T10:00:00.000Z"),
    });
    const lower = voided({
      sale: { id: "a", operationNumber: null, invoice: null },
      voidedAt: moment,
    });
    const upper = voided({
      sale: { id: "B", operationNumber: null, invoice: null },
      voidedAt: moment,
    });

    const group = voidedSalesGroup([older, lower, upper]);

    expect(group.rows.map((row) => row.sale.id)).toEqual(["B", "a", "z"]);
  });

  it("totals how many sales were voided and the amount they refunded", () => {
    const group = voidedSalesGroup([
      voided({ total: 5_000 }),
      voided({ sale: { id: "v2", operationNumber: 21, invoice: null }, total: 1_250 }),
    ]);

    expect(group.totals).toEqual({ voids: 2, voided: 6_250 });
  });

  it("keeps everything else the record says and totals nothing without voids", () => {
    const original = voided({
      cashier: null,
      authorizer: { id: "beto", name: null },
      sale: { id: "v1", operationNumber: null, invoice: { pointOfSale: 3, number: 45 } },
    });

    expect(voidedSalesGroup([original]).rows).toEqual([original]);
    expect(voidedSalesGroup([])).toEqual({ rows: [], totals: { voids: 0, voided: 0 } });
  });

  it("does not reorder the records it is given", () => {
    const records = [
      voided({ sale: { id: "a", operationNumber: null, invoice: null } }),
      voided({
        sale: { id: "b", operationNumber: null, invoice: null },
        voidedAt: new Date("2026-10-06T15:00:00.000Z"),
      }),
    ];

    voidedSalesGroup(records);

    expect(records.map((entry) => entry.sale.id)).toEqual(["a", "b"]);
  });
});

describe("returnsReportTotals", () => {
  it("counts the refunded lines apart from the exchanged ones and totals the amounts", () => {
    const totals = returnsReportTotals(
      [
        record({
          returnId: "r1",
          lines: [
            line({ refunded: 1_000 }),
            line({ saleLineId: "l2", resolution: "exchange", refunded: 0 }),
            line({ saleLineId: "l3", resolution: "exchange", refunded: 0 }),
          ],
        }),
        record({ returnId: "r2", ticketSource: "TYPED", lines: [line({ refunded: 400 })] }),
      ],
      [voided({ total: 5_000 }), voided({ total: 700 })],
    );

    expect(totals).toEqual({
      voids: 2,
      voided: 5_700,
      returns: 2,
      refunded: 1_400,
      refundedLines: 2,
      exchangedLines: 2,
      typedReturns: 1,
    });
  });

  it("totals nothing when there is nothing", () => {
    expect(returnsReportTotals([], [])).toEqual({
      voids: 0,
      voided: 0,
      returns: 0,
      refunded: 0,
      refundedLines: 0,
      exchangedLines: 0,
      typedReturns: 0,
    });
  });
});

describe("voidsAndReturnsByCashier", () => {
  const none = {
    voids: 0,
    voided: 0,
    returns: 0,
    refunded: 0,
    refundedLines: 0,
    exchangedLines: 0,
    typedReturns: 0,
  };

  it("gives each cashier the returns they made and the sales they voided", () => {
    const rows = voidsAndReturnsByCashier(
      [
        record({ returnId: "r1", cashier: { id: "ana", name: "Ana" } }),
        record({
          returnId: "r2",
          cashier: { id: "ana", name: "Ana" },
          ticketSource: "TYPED",
          lines: [line({ resolution: "exchange", refunded: 0 })],
        }),
        record({ returnId: "r3", cashier: { id: "beto", name: "Beto" } }),
      ],
      [
        voided({ cashier: { id: "beto", name: "Beto" }, total: 900 }),
        voided({ cashier: { id: "ana", name: "Ana" }, total: 100 }),
      ],
    );

    expect(rows).toEqual([
      {
        cashier: { id: "ana", name: "Ana" },
        voids: 1,
        voided: 100,
        returns: 2,
        refunded: 1_000,
        refundedLines: 1,
        exchangedLines: 1,
        typedReturns: 1,
      },
      {
        cashier: { id: "beto", name: "Beto" },
        voids: 1,
        voided: 900,
        returns: 1,
        refunded: 1_000,
        refundedLines: 1,
        exchangedLines: 0,
        typedReturns: 0,
      },
    ]);
  });

  it("gives a void whose voider is unknown its own row, listed last", () => {
    const rows = voidsAndReturnsByCashier(
      [],
      [voided({ cashier: null, total: 300 }), voided({ cashier: { id: "zeta", name: "Zeta" } })],
    );

    expect(rows.map((row) => row.cashier)).toEqual([{ id: "zeta", name: "Zeta" }, null]);
    expect(rows[1]).toEqual({ cashier: null, ...none, voids: 1, voided: 300 });
  });

  it("orders cashiers by name in code units, a nameless one after the named, then by id", () => {
    const rows = voidsAndReturnsByCashier(
      [
        record({ returnId: "r1", cashier: { id: "u3", name: null } }),
        record({ returnId: "r2", cashier: { id: "u2", name: "beto" } }),
        record({ returnId: "r3", cashier: { id: "u1", name: "Beto" } }),
        record({ returnId: "r4", cashier: { id: "u0", name: null } }),
      ],
      [],
    );

    expect(rows.map((row) => row.cashier?.id)).toEqual(["u1", "u2", "u0", "u3"]);
  });

  it.each([
    ["the unknown voider first", [null, "named", "nameless"]],
    ["the unknown voider last", ["nameless", "named", null]],
    ["the unknown voider between", ["named", null, "nameless"]],
    ["the nameless cashier first", ["nameless", null, "named"]],
  ] as const)(
    "lists named cashiers, then nameless ones, then the unknown voider, whatever the order they come in (%s)",
    (_name, order) => {
      const cashiers = {
        named: { id: "u2", name: "Ana" },
        nameless: { id: "u1", name: null },
      };

      const rows = voidsAndReturnsByCashier(
        [],
        order.map((key) => voided({ cashier: key === null ? null : cashiers[key] })),
      );

      expect(rows.map((row) => row.cashier)).toEqual([cashiers.named, cashiers.nameless, null]);
    },
  );

  it.each([
    ["u1 then u2", ["u1", "u2"]],
    ["u2 then u1", ["u2", "u1"]],
  ])("orders cashiers with the same name by id (%s)", (_name, ids) => {
    const rows = voidsAndReturnsByCashier(
      [],
      ids.map((id) => voided({ cashier: { id, name: "Ana" } })),
    );

    expect(rows.map((row) => row.cashier?.id)).toEqual(["u1", "u2"]);
  });

  it("orders nameless cashiers by id", () => {
    const rows = voidsAndReturnsByCashier(
      [],
      ["u2", "u1"].map((id) => voided({ cashier: { id, name: null } })),
    );

    expect(rows.map((row) => row.cashier?.id)).toEqual(["u1", "u2"]);
  });

  it("answers nothing without returns or voids", () => {
    expect(voidsAndReturnsByCashier([], [])).toEqual([]);
  });
});

describe("voidsAndReturnsByAuthorizer", () => {
  it("gives each authorizer what they authorized and the operations needing nobody their own row, last", () => {
    const rows = voidsAndReturnsByAuthorizer(
      [
        record({ returnId: "r1", authorizer: { id: "beto", name: "Beto" } }),
        record({ returnId: "r2", authorizer: null }),
      ],
      [
        voided({ authorizer: { id: "ana", name: "Ana" }, total: 800 }),
        voided({ authorizer: null, total: 200 }),
        voided({ authorizer: { id: "beto", name: "Beto" }, total: 50 }),
      ],
    );

    expect(rows).toEqual([
      {
        authorizer: { id: "ana", name: "Ana" },
        voids: 1,
        voided: 800,
        returns: 0,
        refunded: 0,
        refundedLines: 0,
        exchangedLines: 0,
        typedReturns: 0,
      },
      {
        authorizer: { id: "beto", name: "Beto" },
        voids: 1,
        voided: 50,
        returns: 1,
        refunded: 1_000,
        refundedLines: 1,
        exchangedLines: 0,
        typedReturns: 0,
      },
      {
        authorizer: null,
        voids: 1,
        voided: 200,
        returns: 1,
        refunded: 1_000,
        refundedLines: 1,
        exchangedLines: 0,
        typedReturns: 0,
      },
    ]);
  });
});
