import { describe, expect, it } from "vitest";
import {
  type CancelledSaleFacts,
  type RemovedLinesGroup,
  tallyRemovals,
} from "./removed-lines-and-cancelled-sales-report.js";

const OPENED_AT = new Date("2026-10-06T11:00:00.000Z");

const removed = (overrides: Partial<RemovedLinesGroup> = {}): RemovedLinesGroup => ({
  sessionId: "s1",
  registerName: "Caja 1",
  openedAt: OPENED_AT,
  cashierId: "u1",
  cashierName: "Ana",
  weightSource: null,
  lines: 1,
  quantity: 1,
  amount: 100,
  ...overrides,
});

const cancelled = (overrides: Partial<CancelledSaleFacts> = {}): CancelledSaleFacts => ({
  saleId: "v1",
  sessionId: "s1",
  registerName: "Caja 1",
  openedAt: OPENED_AT,
  cashierId: "u1",
  cashierName: "Ana",
  total: 100,
  paymentStates: [],
  lines: [{ weightSource: null, quantity: 1 }],
  ...overrides,
});

const none = { lines: 0, units: 0, thousandths: 0, amount: 0 };
const noSales = { sales: 0, units: 0, thousandths: 0, amount: 0 };

describe("tallyRemovals", () => {
  it("reports nothing when nothing was removed or cancelled", () => {
    expect(tallyRemovals({ removedLines: [], cancelledSales: [] })).toEqual({
      cashiers: [],
      sessions: [],
      totals: { removed: none, cancelled: noSales },
    });
  });

  it("adds the removed lines of a cashier across groups, counting units and amount", () => {
    const report = tallyRemovals({
      removedLines: [
        removed({ lines: 2, quantity: 5, amount: 500 }),
        removed({ sessionId: "s2", lines: 1, quantity: 1, amount: 70 }),
      ],
      cancelledSales: [],
    });

    expect(report.cashiers).toEqual([
      {
        cashierId: "u1",
        name: "Ana",
        removed: { lines: 3, units: 6, thousandths: 0, amount: 570 },
        cancelled: noSales,
      },
    ]);
    expect(report.totals.removed).toEqual({ lines: 3, units: 6, thousandths: 0, amount: 570 });
  });

  it("counts the quantity of a weighed removed line in thousandths and not in units", () => {
    const report = tallyRemovals({
      removedLines: [
        removed({ weightSource: "SCALE", quantity: 1_500, amount: 900 }),
        removed({ weightSource: "MANUAL", quantity: 250, amount: 100 }),
        removed({ weightSource: null, quantity: 2, amount: 50 }),
      ],
      cancelledSales: [],
    });

    expect(report.totals.removed).toEqual({
      lines: 3,
      units: 2,
      thousandths: 1_750,
      amount: 1_050,
    });
  });

  it("counts a cancelled sale once, with the units, thousandths and total of what it held", () => {
    const report = tallyRemovals({
      removedLines: [],
      cancelledSales: [
        cancelled({
          total: 1_200,
          lines: [
            { weightSource: null, quantity: 3 },
            { weightSource: "SCALE", quantity: 500 },
            { weightSource: "MANUAL", quantity: 200 },
          ],
        }),
      ],
    });

    expect(report.totals.cancelled).toEqual({
      sales: 1,
      units: 3,
      thousandths: 700,
      amount: 1_200,
    });
    expect(report.cashiers).toEqual([
      { cashierId: "u1", name: "Ana", removed: none, cancelled: report.totals.cancelled },
    ]);
  });

  it("counts a cancelled sale whose only payments never were approved", () => {
    const report = tallyRemovals({
      removedLines: [],
      cancelledSales: [
        cancelled({ saleId: "a", paymentStates: [] }),
        cancelled({ saleId: "b", paymentStates: ["PENDING"] }),
        cancelled({ saleId: "c", paymentStates: ["DECLINED", "EXPIRED"] }),
      ],
    });

    expect(report.totals.cancelled.sales).toBe(3);
  });

  it("leaves out a cancelled sale that had an approved payment", () => {
    const report = tallyRemovals({
      removedLines: [],
      cancelledSales: [
        cancelled({ saleId: "a", paymentStates: ["APPROVED"] }),
        cancelled({ saleId: "b", paymentStates: ["DECLINED", "APPROVED"] }),
      ],
    });

    expect(report).toEqual({
      cashiers: [],
      sessions: [],
      totals: { removed: none, cancelled: noSales },
    });
  });

  it("keeps removals and cancellations of one cashier and session in the same row", () => {
    const report = tallyRemovals({
      removedLines: [removed({ quantity: 2, amount: 300 })],
      cancelledSales: [cancelled({ total: 800 })],
    });

    expect(report.sessions).toEqual([
      {
        sessionId: "s1",
        registerName: "Caja 1",
        openedAt: OPENED_AT,
        removed: { lines: 1, units: 2, thousandths: 0, amount: 300 },
        cancelled: { sales: 1, units: 1, thousandths: 0, amount: 800 },
      },
    ]);
  });

  it("lists a cashier who only cancelled and one who only removed", () => {
    const report = tallyRemovals({
      removedLines: [removed({ cashierId: "u1", cashierName: "Ana", amount: 100 })],
      cancelledSales: [cancelled({ cashierId: "u2", cashierName: "Beto", total: 400 })],
    });

    expect(report.cashiers.map((row) => row.cashierId)).toEqual(["u2", "u1"]);
  });

  it("orders cashiers by what they removed and cancelled together, then by name, then by id", () => {
    const report = tallyRemovals({
      removedLines: [
        removed({ cashierId: "u1", cashierName: "Ana", amount: 300 }),
        removed({ cashierId: "u2", cashierName: "Beto", amount: 100 }),
        removed({ cashierId: "u3", cashierName: "Carla", amount: 100 }),
        removed({ cashierId: "u5", cashierName: null, amount: 100 }),
        removed({ cashierId: "u4", cashierName: null, amount: 100 }),
      ],
      cancelledSales: [
        cancelled({ saleId: "x", cashierId: "u2", cashierName: "Beto", total: 250 }),
      ],
    });

    expect(report.cashiers.map((row) => row.cashierId)).toEqual(["u2", "u1", "u3", "u4", "u5"]);
  });

  it("orders sessions by what was removed and cancelled in them, then newest first, then by id", () => {
    const earlier = new Date("2026-10-05T11:00:00.000Z");
    const report = tallyRemovals({
      removedLines: [
        removed({ sessionId: "s1", openedAt: earlier, amount: 100 }),
        removed({ sessionId: "s2", openedAt: OPENED_AT, amount: 100 }),
        removed({ sessionId: "s4", openedAt: OPENED_AT, amount: 100 }),
        removed({ sessionId: "s3", openedAt: OPENED_AT, amount: 100 }),
        removed({ sessionId: "s5", openedAt: earlier, amount: 900 }),
      ],
      cancelledSales: [],
    });

    expect(report.sessions.map((row) => row.sessionId)).toEqual(["s5", "s2", "s3", "s4", "s1"]);
  });

  it("totals what every cashier removed and cancelled", () => {
    const report = tallyRemovals({
      removedLines: [
        removed({ cashierId: "u1", lines: 2, quantity: 2, amount: 200 }),
        removed({ cashierId: "u2", cashierName: "Beto", lines: 1, quantity: 1, amount: 50 }),
      ],
      cancelledSales: [
        cancelled({ saleId: "a", total: 90 }),
        cancelled({ saleId: "b", cashierId: "u2", cashierName: "Beto", total: 10 }),
      ],
    });

    expect(report.totals).toEqual({
      removed: { lines: 3, units: 3, thousandths: 0, amount: 250 },
      cancelled: { sales: 2, units: 2, thousandths: 0, amount: 100 },
    });
  });
});
