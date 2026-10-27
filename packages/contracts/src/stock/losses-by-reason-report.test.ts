import { describe, expect, it } from "vitest";
import {
  lossesByReasonReportQuerySchema,
  lossesByReasonReportSchema,
} from "./losses-by-reason-report.js";

describe("lossesByReasonReportQuerySchema", () => {
  it("accepts no period", () => {
    expect(lossesByReasonReportQuerySchema.parse({})).toEqual({});
  });

  it("accepts a period, also of a single day", () => {
    expect(lossesByReasonReportQuerySchema.parse({ from: "2026-12-01", to: "2026-12-31" })).toEqual(
      { from: "2026-12-01", to: "2026-12-31" },
    );
    expect(
      lossesByReasonReportQuerySchema.safeParse({ from: "2026-12-01", to: "2026-12-01" }).success,
    ).toBe(true);
  });

  it.each([
    ["only the first day", { from: "2026-12-01" }],
    ["only the last day", { to: "2026-12-31" }],
    ["a period that ends before it starts", { from: "2026-12-31", to: "2026-12-01" }],
    ["a day that is not a calendar day", { from: "2026-02-30", to: "2026-03-01" }],
  ])("refuses %s", (_name, query) => {
    expect(lossesByReasonReportQuerySchema.safeParse(query).success).toBe(false);
  });

  it("drops a register, which losses do not carry", () => {
    expect(
      lossesByReasonReportQuerySchema.parse({
        from: "2026-12-01",
        to: "2026-12-31",
        register_id: "9a3f6c52-1d84-4b07-8c1e-5e7a2b9d4f10",
      }),
    ).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
});

describe("lossesByReasonReportSchema", () => {
  const product = {
    id: "product-1",
    name: "Yerba",
    sale_unit: "UNIT",
    quantity: 3_000,
    loss_count: 2,
  };
  const reason = { reason: "spoiled", loss_count: 2, products: [product] };
  const report = { range: { from: "2026-10-01", to: "2026-10-06" }, reasons: [reason] };

  it("accepts the range and the reasons with their products", () => {
    expect(lossesByReasonReportSchema.parse(report)).toEqual(report);
  });

  it("accepts a report without losses", () => {
    const empty = { range: report.range, reasons: [] };

    expect(lossesByReasonReportSchema.parse(empty)).toEqual(empty);
  });

  it.each(["broken_or_spilled", "spoiled", "theft", "expired", "return_discard"])(
    "accepts the reason %s",
    (name) => {
      expect(
        lossesByReasonReportSchema.safeParse({ ...report, reasons: [{ ...reason, reason: name }] })
          .success,
      ).toBe(true);
    },
  );

  it.each([
    ["a reason that is not in the catalog", { reason: "lost_in_move" }],
    ["a loss count of zero", { loss_count: 0 }],
    ["a loss count with decimals", { loss_count: 1.5 }],
    ["a missing loss count", { loss_count: undefined }],
  ])("refuses %s on a reason", (_name, change) => {
    expect(
      lossesByReasonReportSchema.safeParse({ ...report, reasons: [{ ...reason, ...change }] })
        .success,
    ).toBe(false);
  });

  it.each([
    ["an empty id", { id: "" }],
    ["a quantity of zero", { quantity: 0 }],
    ["a negative quantity", { quantity: -1 }],
    ["a quantity with decimals", { quantity: 0.5 }],
    ["a loss count of zero", { loss_count: 0 }],
    ["a loss count with decimals", { loss_count: 1.5 }],
    ["a sale unit that is not offered", { sale_unit: "LITRO" }],
    ["a missing name", { name: undefined }],
  ])("refuses %s on a product", (_name, change) => {
    expect(
      lossesByReasonReportSchema.safeParse({
        ...report,
        reasons: [{ ...reason, products: [{ ...product, ...change }] }],
      }).success,
    ).toBe(false);
  });

  it("refuses a range day that is not a calendar day", () => {
    expect(
      lossesByReasonReportSchema.safeParse({ ...report, range: { from: "ayer", to: "2026-10-06" } })
        .success,
    ).toBe(false);
  });
});
