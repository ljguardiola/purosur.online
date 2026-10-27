import { describe, expect, it } from "vitest";
import {
  type ReturnRecord,
  type ReturnRecordLine,
  returnRows,
  returnsReportGroups,
} from "./returns-report.js";

function line(overrides: Partial<ReturnRecordLine> = {}): ReturnRecordLine {
  return {
    saleLineId: "l1",
    productName: "Yerba 1 kg",
    quantity: 1,
    reason: "change_of_mind",
    disposition: "restock",
    refunded: 1_000,
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
