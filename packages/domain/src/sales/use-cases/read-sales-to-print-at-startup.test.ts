import { describe, expect, it } from "vitest";
import { readSalesToPrintAtStartup, type StartupSale } from "./read-sales-to-print-at-startup.js";
import { FakeStartupSales } from "./test-support/fake-startup-sales.js";

const COMPLETED_AT = new Date("2026-10-13T12:00:00.000Z");
const ATTEMPTED_AT = new Date("2026-10-13T12:01:00.000Z");
const PRINTED_AT = new Date("2026-10-13T12:01:02.000Z");

function sale(overrides: Partial<StartupSale> = {}): StartupSale {
  return {
    saleId: "sale-1",
    completedAt: COMPLETED_AT,
    total: 345000,
    printAttemptedAt: null,
    printedAt: null,
    ...overrides,
  };
}

describe("readSalesToPrintAtStartup", () => {
  it("offers a sale with no print attempt as never printed, with its time and total", () => {
    const sales = new FakeStartupSales([sale()]);

    expect(readSalesToPrintAtStartup({ sales })).toEqual([
      { saleId: "sale-1", completedAt: COMPLETED_AT, total: 345000, standing: "never_printed" },
    ]);
  });

  it("offers a sale whose print was attempted but never recorded as handed over as outcome unknown", () => {
    const sales = new FakeStartupSales([sale({ printAttemptedAt: ATTEMPTED_AT })]);

    expect(readSalesToPrintAtStartup({ sales })).toEqual([
      { saleId: "sale-1", completedAt: COMPLETED_AT, total: 345000, standing: "outcome_unknown" },
    ]);
  });

  it("leaves out a sale whose ticket was handed to the printer", () => {
    const sales = new FakeStartupSales([
      sale({ printAttemptedAt: ATTEMPTED_AT, printedAt: PRINTED_AT }),
    ]);

    expect(readSalesToPrintAtStartup({ sales })).toEqual([]);
  });

  it("keeps the order the sales were answered in", () => {
    const sales = new FakeStartupSales([
      sale({ saleId: "sale-1" }),
      sale({ saleId: "printed", printAttemptedAt: ATTEMPTED_AT, printedAt: PRINTED_AT }),
      sale({ saleId: "sale-3", printAttemptedAt: ATTEMPTED_AT }),
    ]);

    expect(readSalesToPrintAtStartup({ sales }).map(({ saleId }) => saleId)).toEqual([
      "sale-1",
      "sale-3",
    ]);
  });

  it("offers nothing when the open session has no completed sale", () => {
    expect(readSalesToPrintAtStartup({ sales: new FakeStartupSales() })).toEqual([]);
  });
});
