import { describe, expect, it } from "vitest";
import type { ReturnRecord } from "../model/returns-report.js";
import { readReturnsReport } from "./read-returns-report.js";
import { FakeReturnsReportReader } from "./test-support/fake-returns-report-reader.js";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const clock = { now: () => NOW };
const noRange = { from: undefined, to: undefined };

function record(overrides: Partial<ReturnRecord> = {}): ReturnRecord {
  return {
    returnId: "r1",
    occurredAt: new Date("2026-10-06T14:00:00.000Z"),
    ticketSource: "QR",
    register: { id: "reg-1", name: "Caja 1" },
    sale: { id: "s1", operationNumber: 12, invoice: null },
    cashier: { id: "ana", name: "Ana" },
    authorizer: null,
    lines: [
      {
        saleLineId: "l1",
        productName: "Yerba 1 kg",
        quantity: 1,
        reason: "defective",
        disposition: "discard",
        refunded: 1_000,
      },
    ],
    ...overrides,
  };
}

describe("readReturnsReport", () => {
  it("reads the range asked and answers with it", async () => {
    const reader = new FakeReturnsReportReader();

    const report = await readReturnsReport(
      { reader, clock },
      {
        locationId: "branch-1",
        asked: { from: "2026-10-01", to: "2026-10-06" },
        registerId: undefined,
      },
    );

    expect(report.range).toEqual({ from: "2026-10-01", to: "2026-10-06" });
    expect(reader.reads).toEqual([
      {
        locationId: "branch-1",
        range: { from: "2026-10-01", to: "2026-10-06" },
        registerId: undefined,
      },
    ]);
  });

  it("answers today's Argentine day when no range is asked", async () => {
    const reader = new FakeReturnsReportReader();

    const report = await readReturnsReport(
      { reader, clock: { now: () => new Date("2026-10-07T02:30:00.000Z") } },
      { locationId: "branch-1", asked: noRange, registerId: undefined },
    );

    expect(report.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
  });

  it("asks only for the register and the branch it was given", async () => {
    const reader = new FakeReturnsReportReader();

    await readReturnsReport(
      { reader, clock },
      { locationId: "branch-2", asked: noRange, registerId: "reg-9" },
    );

    expect(reader.reads.map(({ locationId, registerId }) => [locationId, registerId])).toEqual([
      ["branch-2", "reg-9"],
    ]);
  });

  it("keeps the hand-started returns apart from the scanned ones and totals each", async () => {
    const reader = new FakeReturnsReportReader([
      record({ returnId: "q1", ticketSource: "QR" }),
      record({ returnId: "t1", ticketSource: "TYPED" }),
      record({ returnId: "t2", ticketSource: "TYPED" }),
    ]);

    const report = await readReturnsReport(
      { reader, clock },
      { locationId: "branch-1", asked: noRange, registerId: undefined },
    );

    expect(report.scanned.rows.map((row) => row.returnId)).toEqual(["q1"]);
    expect(report.typed.rows.map((row) => row.returnId)).toEqual(["t1", "t2"]);
    expect(report.scanned.totals).toEqual({ returns: 1, refunded: 1_000 });
    expect(report.typed.totals).toEqual({ returns: 2, refunded: 2_000 });
  });
});
