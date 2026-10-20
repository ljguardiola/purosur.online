import { describe, expect, it } from "vitest";
import type { LineDiscountRecord, SaleDiscountRecord } from "../model/manual-discounts-report.js";
import { readManualDiscounts } from "./read-manual-discounts.js";
import { FakeManualDiscountsReportReader } from "./test-support/fake-manual-discounts-report-reader.js";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const clock = { now: () => NOW };
const noRange = { from: undefined, to: undefined };
const MOMENT = new Date("2026-10-06T14:00:00.000Z");

const saleDiscount: SaleDiscountRecord = {
  saleId: "s1",
  operationNumber: 12,
  completedAt: MOMENT,
  actorId: "ana",
  actorName: "Ana",
  authorizedBy: "beto",
  authorizedByName: "Beto",
  reason: "Cliente frecuente",
  discount: { kind: "AMOUNT", amount: 700 },
  amount: 700,
};

const lineDiscount: LineDiscountRecord = {
  saleId: "s2",
  operationNumber: null,
  completedAt: new Date("2026-10-06T13:00:00.000Z"),
  actorId: "ana",
  actorName: "Ana",
  authorizedBy: null,
  authorizedByName: null,
  reason: "Envase dañado",
  lineId: "l1",
  productName: "Yerba 1 kg",
  quantity: 2,
  weightSource: null,
  listUnitPrice: 1_000,
  adjustment: { kind: "PERCENT", percent: 10 },
};

const records = { saleDiscounts: [saleDiscount], lineDiscounts: [lineDiscount] };
const everyone = { locationId: "branch-1", asked: noRange, registerId: undefined };

describe("readManualDiscounts", () => {
  it("lists the discounts of the asked range, totals them and names who authorized them", async () => {
    const reader = new FakeManualDiscountsReportReader(records);

    const report = await readManualDiscounts(
      { reader, clock },
      {
        locationId: "branch-1",
        asked: { from: "2026-10-01", to: "2026-10-06" },
        registerId: undefined,
        authorizedBy: undefined,
      },
    );

    expect(report.range).toEqual({ from: "2026-10-01", to: "2026-10-06" });
    expect(report.rows.map((row) => [row.saleId, row.kind, row.discounted])).toEqual([
      ["s1", "SALE", 700],
      ["s2", "LINE", 200],
    ]);
    expect(report.totals).toEqual({
      discounted: 900,
      count: 2,
      lineCount: 1,
      saleCount: 1,
      mostAuthorized: { id: "ana", name: "Ana", count: 1 },
    });
    expect(report.authorizers).toEqual([
      { id: "ana", name: "Ana" },
      { id: "beto", name: "Beto" },
    ]);
    expect(reader.reads).toEqual([
      {
        locationId: "branch-1",
        range: { from: "2026-10-01", to: "2026-10-06" },
        registerId: undefined,
      },
    ]);
  });

  it("asks for the current day of the clock when no range is asked", async () => {
    const reader = new FakeManualDiscountsReportReader();

    const report = await readManualDiscounts(
      { reader, clock },
      { ...everyone, authorizedBy: undefined },
    );

    expect(report.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
    expect(reader.reads[0]?.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
  });

  it("limits the read to the asked register", async () => {
    const reader = new FakeManualDiscountsReportReader();

    await readManualDiscounts(
      { reader, clock },
      { ...everyone, registerId: "register-2", authorizedBy: undefined },
    );

    expect(reader.reads[0]?.registerId).toBe("register-2");
  });

  describe("limited to who authorized", () => {
    it("keeps only the discounts that person authorized, counting the cashier's own", async () => {
      const reader = new FakeManualDiscountsReportReader(records);

      const byAna = await readManualDiscounts(
        { reader, clock },
        { ...everyone, authorizedBy: "ana" },
      );
      const byBeto = await readManualDiscounts(
        { reader, clock },
        { ...everyone, authorizedBy: "beto" },
      );

      expect(byAna.rows.map((row) => row.saleId)).toEqual(["s2"]);
      expect(byBeto.rows.map((row) => row.saleId)).toEqual(["s1"]);
    });

    it("totals only the kept discounts", async () => {
      const reader = new FakeManualDiscountsReportReader(records);

      const report = await readManualDiscounts(
        { reader, clock },
        { ...everyone, authorizedBy: "beto" },
      );

      expect(report.totals).toEqual({
        discounted: 700,
        count: 1,
        lineCount: 0,
        saleCount: 1,
        mostAuthorized: { id: "beto", name: "Beto", count: 1 },
      });
    });

    it("still offers every person who authorized a discount in the range", async () => {
      const reader = new FakeManualDiscountsReportReader(records);

      const report = await readManualDiscounts(
        { reader, clock },
        { ...everyone, authorizedBy: "beto" },
      );

      expect(report.authorizers).toEqual([
        { id: "ana", name: "Ana" },
        { id: "beto", name: "Beto" },
      ]);
    });

    it("does not ask the reader to filter", async () => {
      const reader = new FakeManualDiscountsReportReader(records);

      await readManualDiscounts({ reader, clock }, { ...everyone, authorizedBy: "beto" });

      expect(reader.reads[0]).not.toHaveProperty("authorizedBy");
    });

    it("reports no rows for a person who authorized nothing", async () => {
      const reader = new FakeManualDiscountsReportReader(records);

      const report = await readManualDiscounts(
        { reader, clock },
        { ...everyone, authorizedBy: "nobody" },
      );

      expect(report.rows).toEqual([]);
    });
  });

  it("reports no rows, zero totals and no authorizers for a range without discounts", async () => {
    const report = await readManualDiscounts(
      { reader: new FakeManualDiscountsReportReader(), clock },
      { ...everyone, authorizedBy: undefined },
    );

    expect(report.rows).toEqual([]);
    expect(report.authorizers).toEqual([]);
    expect(report.totals).toEqual({
      discounted: 0,
      count: 0,
      lineCount: 0,
      saleCount: 0,
      mostAuthorized: null,
    });
  });
});
