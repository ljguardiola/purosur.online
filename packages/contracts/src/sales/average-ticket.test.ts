import { describe, expect, it } from "vitest";
import { averageTicketSchema } from "./average-ticket.js";

const report = {
  range: { from: "2026-10-08", to: "2026-10-14" },
  previous_range: { from: "2026-10-01", to: "2026-10-07" },
  current: { sales_count: 4, total: 15_000, average_ticket: 3_750 },
  previous: { sales_count: 2, total: 6_000, average_ticket: 3_000 },
  change_tenths: 250,
  weeks: [
    { from: "2026-10-08", to: "2026-10-14", sales_count: 4, total: 15_000, average_ticket: 3_750 },
  ],
};

describe("averageTicketSchema", () => {
  it("accepts a range compared with the one before it", () => {
    expect(averageTicketSchema.parse(report)).toEqual(report);
  });

  it("accepts a fall, which is a negative change", () => {
    expect(averageTicketSchema.safeParse({ ...report, change_tenths: -120 }).success).toBe(true);
  });

  it("accepts ranges without sales, which have no average ticket and no change", () => {
    const empty = {
      ...report,
      current: { sales_count: 0, total: 0, average_ticket: null },
      previous: { sales_count: 0, total: 0, average_ticket: null },
      change_tenths: null,
      weeks: [
        { from: "2026-10-08", to: "2026-10-14", sales_count: 0, total: 0, average_ticket: null },
      ],
    };

    expect(averageTicketSchema.parse(empty)).toEqual(empty);
  });

  it.each([
    ["a change with decimals", { change_tenths: 2.5 }],
    ["a missing change", { change_tenths: undefined }],
    ["a range bound that is not a calendar day", { range: { from: "ayer", to: "2026-10-14" } }],
    [
      "a previous range bound that is not a calendar day",
      { previous_range: { from: "2026-02-30", to: "2026-10-07" } },
    ],
    ["a negative sales count", { current: { ...report.current, sales_count: -1 } }],
    ["an amount with decimals", { previous: { ...report.previous, total: 10.5 } }],
    ["a missing average ticket", { current: { sales_count: 4, total: 15_000 } }],
    ["an average ticket with decimals", { current: { ...report.current, average_ticket: 0.5 } }],
    ["a week bound that is not a calendar day", { weeks: [{ ...report.weeks[0], from: "x" }] }],
    ["a week with a negative amount", { weeks: [{ ...report.weeks[0], total: -1 }] }],
    [
      "a week with a sales count with decimals",
      { weeks: [{ ...report.weeks[0], sales_count: 1.5 }] },
    ],
    [
      "a week without an average ticket field",
      { weeks: [{ ...report.weeks[0], average_ticket: undefined }] },
    ],
    ["no weeks field", { weeks: undefined }],
  ])("refuses %s", (_name, change) => {
    expect(averageTicketSchema.safeParse({ ...report, ...change }).success).toBe(false);
  });
});
