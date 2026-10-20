import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { manualDiscountsQuerySchema, manualDiscountsSchema } from "./manual-discounts.js";

const REGISTER_ID = "4b0d2c1e-7f3a-4e58-9a61-0c5d8e2f1a77";
const USER_ID = "9a3e7c40-2b1d-4f6a-8c05-5d7e1a3b9c28";

describe("manualDiscountsQuerySchema", () => {
  it("accepts a query asking for nothing", () => {
    expect(manualDiscountsQuerySchema.parse({})).toEqual({});
  });

  it("accepts a range of calendar days, a register and who authorized", () => {
    const query = {
      from: "2026-10-01",
      to: "2026-10-06",
      register_id: REGISTER_ID,
      authorized_by: USER_ID,
    };

    expect(manualDiscountsQuerySchema.parse(query)).toEqual(query);
  });

  it("reads a user id written in capitals as the lowercase id records are kept under", () => {
    expect(manualDiscountsQuerySchema.parse({ authorized_by: USER_ID.toUpperCase() })).toEqual({
      authorized_by: USER_ID,
    });
  });

  it.each([
    ["a range ending before it starts", { from: "2026-10-06", to: "2026-10-05" }],
    ["a start without an end", { from: "2026-10-06" }],
    ["a register that is not an id", { register_id: "caja-1" }],
    ["an authorizer that is not an id", { authorized_by: "Ana" }],
    ["an empty authorizer", { authorized_by: "" }],
  ])("refuses %s", (_name, query) => {
    expect(manualDiscountsQuerySchema.safeParse(query).success).toBe(false);
  });
});

const saleRow = {
  kind: "SALE",
  sale_id: "6f1c2b7e-0a4d-4c55-8d21-3b9e5a7c1d02",
  operation_number: 12,
  line_id: null,
  completed_at: "2026-10-06T14:00:00.000Z",
  product_name: null,
  adjustment: { kind: "PERCENT", value: 10 },
  reason: "Cliente frecuente",
  authorizer: { id: USER_ID, name: "Ana" },
  discounted: 500,
};

const lineRow = {
  kind: "LINE",
  sale_id: "0e8a5d31-6b2c-4f79-a3d4-8c1b7e9f2a65",
  operation_number: null,
  line_id: "5d2b8f14-9c3e-4a70-b1e6-7a4c0d9e3f58",
  completed_at: "2026-10-06T13:00:00.000Z",
  product_name: "Yerba 1 kg",
  adjustment: { kind: "PRICE", value: 800 },
  reason: "Envase dañado",
  authorizer: { id: "gone", name: null },
  discounted: 200,
};

const report = {
  range: { from: "2026-10-05", to: "2026-10-06" },
  rows: [saleRow, lineRow],
  totals: {
    discounted: 700,
    count: 2,
    line_count: 1,
    sale_count: 1,
    most_authorized: { id: USER_ID, name: "Ana", count: 1 },
  },
  authorizers: [
    { id: USER_ID, name: "Ana" },
    { id: "gone", name: null },
  ],
};

describe("manualDiscountsSchema", () => {
  it("accepts the discounts of a range with their totals and authorizers", () => {
    expect(manualDiscountsSchema.parse(report)).toEqual(report);
  });

  it("accepts a range without discounts, which has no most authorized person", () => {
    const empty = {
      ...report,
      rows: [],
      totals: { discounted: 0, count: 0, line_count: 0, sale_count: 0, most_authorized: null },
      authorizers: [],
    };

    expect(manualDiscountsSchema.parse(empty)).toEqual(empty);
  });

  it.each(["PERCENT", "AMOUNT"])("accepts a %s discount on the total", (kind) => {
    const row = { ...saleRow, adjustment: { kind, value: 5 } };

    expect(manualDiscountsSchema.parse({ ...report, rows: [row] }).rows).toEqual([row]);
  });

  it.each(["PRICE", "PERCENT", "AMOUNT"])("accepts a %s adjustment on a line", (kind) => {
    const row = { ...lineRow, adjustment: { kind, value: 5 } };

    expect(manualDiscountsSchema.parse({ ...report, rows: [row] }).rows).toEqual([row]);
  });

  it("declares the zone the instant of a discount is shown in", () => {
    const [saleShape] = manualDiscountsSchema.shape.rows.element.options;

    expect(saleShape.shape.completed_at.meta()).toEqual({ timeZone: ARGENTINA_TIME_ZONE });
  });

  it.each([
    ["a range bound that is not a calendar day", { range: { from: "ayer", to: "2026-10-06" } }],
    ["a negative total", { totals: { ...report.totals, discounted: -1 } }],
    ["a total with decimals", { totals: { ...report.totals, discounted: 1.5 } }],
    ["a negative count", { totals: { ...report.totals, count: -1 } }],
    ["a count with decimals", { totals: { ...report.totals, count: 1.5 } }],
    ["a negative line count", { totals: { ...report.totals, line_count: -1 } }],
    ["a line count with decimals", { totals: { ...report.totals, line_count: 1.5 } }],
    ["a negative sale count", { totals: { ...report.totals, sale_count: -1 } }],
    ["a sale count with decimals", { totals: { ...report.totals, sale_count: 1.5 } }],
    [
      "a most authorized person without an id",
      { totals: { ...report.totals, most_authorized: { name: "Ana", count: 1 } } },
    ],
    [
      "a most authorized person with an empty id",
      { totals: { ...report.totals, most_authorized: { id: "", name: "Ana", count: 1 } } },
    ],
    [
      "a most authorized person without a name field",
      { totals: { ...report.totals, most_authorized: { id: USER_ID, count: 1 } } },
    ],
    [
      "a most authorized count that is negative",
      { totals: { ...report.totals, most_authorized: { id: USER_ID, name: "Ana", count: -1 } } },
    ],
    [
      "a most authorized count with decimals",
      { totals: { ...report.totals, most_authorized: { id: USER_ID, name: "Ana", count: 1.5 } } },
    ],
    ["an authorizer without an id", { authorizers: [{ name: "Ana" }] }],
    ["an authorizer with an empty id", { authorizers: [{ id: "", name: "Ana" }] }],
    ["an authorizer without a name field", { authorizers: [{ id: USER_ID }] }],
  ])("refuses %s", (_name, change) => {
    expect(manualDiscountsSchema.safeParse({ ...report, ...change }).success).toBe(false);
  });

  it.each([
    ["a row of a kind that does not exist", { ...saleRow, kind: "TOTAL" }],
    ["a row without a sale id", { ...saleRow, sale_id: undefined }],
    ["a row with an empty sale id", { ...saleRow, sale_id: "" }],
    ["an operation number of zero", { ...saleRow, operation_number: 0 }],
    ["an operation number with decimals", { ...saleRow, operation_number: 1.5 }],
    ["a row without an operation number field", { ...saleRow, operation_number: undefined }],
    ["something that is not an instant", { ...saleRow, completed_at: "ayer" }],
    ["a row without a reason", { ...saleRow, reason: undefined }],
    ["a row with an empty reason", { ...saleRow, reason: "" }],
    ["a negative amount discounted", { ...saleRow, discounted: -1 }],
    ["an amount discounted with decimals", { ...saleRow, discounted: 1.5 }],
    ["an authorizer without an id", { ...saleRow, authorizer: { name: "Ana" } }],
    ["an authorizer with an empty id", { ...saleRow, authorizer: { id: "", name: "Ana" } }],
    ["an authorizer without a name field", { ...saleRow, authorizer: { id: USER_ID } }],
    [
      "an adjustment of a kind that does not exist",
      { ...saleRow, adjustment: { kind: "X", value: 1 } },
    ],
    ["a negative adjustment value", { ...saleRow, adjustment: { kind: "PERCENT", value: -1 } }],
    [
      "an adjustment value with decimals",
      { ...saleRow, adjustment: { kind: "PERCENT", value: 1.5 } },
    ],
    ["a new price on the total", { ...saleRow, adjustment: { kind: "PRICE", value: 5 } }],
    ["a discount on the total with a line", { ...saleRow, line_id: lineRow.line_id }],
    ["a discount on the total with a product", { ...saleRow, product_name: "Yerba" }],
    ["a line without a line id", { ...lineRow, line_id: null }],
    ["a line with an empty line id", { ...lineRow, line_id: "" }],
    ["a line without a product", { ...lineRow, product_name: null }],
  ])("refuses %s", (_name, row) => {
    expect(manualDiscountsSchema.safeParse({ ...report, rows: [row] }).success).toBe(false);
  });
});
