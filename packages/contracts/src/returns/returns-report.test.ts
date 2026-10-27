import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { returnsReportQuerySchema, returnsReportSchema } from "./returns-report.js";

const REGISTER_ID = "4b0d2c1e-7f3a-4e58-9a61-0c5d8e2f1a77";

describe("returnsReportQuerySchema", () => {
  it("accepts a query asking for nothing", () => {
    expect(returnsReportQuerySchema.parse({})).toEqual({});
  });

  it("accepts a range of calendar days and a register", () => {
    const query = { from: "2026-10-01", to: "2026-10-06", register_id: REGISTER_ID };

    expect(returnsReportQuerySchema.parse(query)).toEqual(query);
  });

  it.each([
    ["a range ending before it starts", { from: "2026-10-06", to: "2026-10-05" }],
    ["a start without an end", { from: "2026-10-06" }],
    ["a register that is not an id", { register_id: "caja-1" }],
  ])("refuses %s", (_name, query) => {
    expect(returnsReportQuerySchema.safeParse(query).success).toBe(false);
  });
});

const line = {
  sale_line_id: "5d2b8f14-9c3e-4a70-b1e6-7a4c0d9e3f58",
  product_name: "Yerba 1 kg",
  sale_unit: "UNIT",
  quantity: 2,
  reason: "defective",
  disposition: "discard",
  refunded: 2_000,
};

const row = {
  return_id: "6f1c2b7e-0a4d-4c55-8d21-3b9e5a7c1d02",
  occurred_at: "2026-10-06T14:00:00.000Z",
  register: { id: REGISTER_ID, name: "Caja 1" },
  sale: {
    id: "0e8a5d31-6b2c-4f79-a3d4-8c1b7e9f2a65",
    operation_number: 12,
    invoice: { point_of_sale: 3, number: 45 },
  },
  cashier: { id: "9a3e7c40-2b1d-4f6a-8c05-5d7e1a3b9c28", name: "Ana" },
  authorizer: { id: "7c1d4e92-3a5b-4d68-9e07-2f8a6b0c4d13", name: "Beto" },
  lines: [line],
  refunded: 2_000,
};

const totals = { returns: 1, refunded: 2_000 };

const report = {
  range: { from: "2026-10-05", to: "2026-10-06" },
  typed: { rows: [row], totals },
  scanned: { rows: [], totals: { returns: 0, refunded: 0 } },
};

describe("returnsReportSchema", () => {
  it("accepts the returns of a range kept apart by how they were started", () => {
    expect(returnsReportSchema.parse(report)).toEqual(report);
  });

  it("accepts a return of a sale without an operation number, an invoice or an authorizer", () => {
    const bare = {
      ...row,
      sale: { id: row.sale.id, operation_number: null, invoice: null },
      authorizer: null,
      cashier: { id: row.cashier.id, name: null },
    };

    expect(
      returnsReportSchema.parse({ ...report, scanned: { rows: [bare], totals } }).scanned.rows,
    ).toEqual([bare]);
  });

  it.each(["change_of_mind", "defective"])("accepts %s as a reason", (reason) => {
    const changed = { ...row, lines: [{ ...line, reason }] };

    expect(
      returnsReportSchema.parse({ ...report, typed: { rows: [changed], totals } }).typed.rows,
    ).toEqual([changed]);
  });

  it.each(["restock", "discard"])("accepts %s as a disposition", (disposition) => {
    const changed = { ...row, lines: [{ ...line, disposition }] };

    expect(
      returnsReportSchema.parse({ ...report, typed: { rows: [changed], totals } }).typed.rows,
    ).toEqual([changed]);
  });

  it("declares the zone the instant of a return is shown in", () => {
    expect(returnsReportSchema.shape.typed.shape.rows.element.shape.occurred_at.meta()).toEqual({
      timeZone: ARGENTINA_TIME_ZONE,
    });
  });

  it.each([
    ["a range bound that is not a calendar day", { range: { from: "ayer", to: "2026-10-06" } }],
    ["a report without the typed returns", { typed: undefined }],
    ["a report without the scanned returns", { scanned: undefined }],
    ["a negative count", { typed: { rows: [row], totals: { returns: -1, refunded: 0 } } }],
    ["a count with decimals", { typed: { rows: [row], totals: { returns: 1.5, refunded: 0 } } }],
    ["a negative refunded total", { typed: { rows: [row], totals: { returns: 1, refunded: -1 } } }],
    [
      "a refunded total with decimals",
      { typed: { rows: [row], totals: { returns: 1, refunded: 1.5 } } },
    ],
  ])("refuses %s", (_name, change) => {
    expect(returnsReportSchema.safeParse({ ...report, ...change }).success).toBe(false);
  });

  it.each([
    ["a row without a return id", { ...row, return_id: undefined }],
    ["a row with an empty return id", { ...row, return_id: "" }],
    ["something that is not an instant", { ...row, occurred_at: "ayer" }],
    ["a register without an id", { ...row, register: { name: "Caja 1" } }],
    ["a register with an empty id", { ...row, register: { id: "", name: "Caja 1" } }],
    ["a register without a name", { ...row, register: { id: REGISTER_ID } }],
    ["a register without a name field", { ...row, register: { id: REGISTER_ID, name: null } }],
    ["a sale with an empty id", { ...row, sale: { ...row.sale, id: "" } }],
    ["an operation number of zero", { ...row, sale: { ...row.sale, operation_number: 0 } }],
    ["an operation number with decimals", { ...row, sale: { ...row.sale, operation_number: 1.5 } }],
    [
      "a sale without an operation number field",
      { ...row, sale: { ...row.sale, operation_number: undefined } },
    ],
    ["a sale without an invoice field", { ...row, sale: { ...row.sale, invoice: undefined } }],
    [
      "an invoice with a point of sale of zero",
      { ...row, sale: { ...row.sale, invoice: { point_of_sale: 0, number: 45 } } },
    ],
    [
      "an invoice number of zero",
      { ...row, sale: { ...row.sale, invoice: { point_of_sale: 3, number: 0 } } },
    ],
    [
      "an invoice number with decimals",
      { ...row, sale: { ...row.sale, invoice: { point_of_sale: 3, number: 1.5 } } },
    ],
    ["a cashier without an id", { ...row, cashier: { name: "Ana" } }],
    ["a cashier with an empty id", { ...row, cashier: { id: "", name: "Ana" } }],
    ["a cashier without a name field", { ...row, cashier: { id: row.cashier.id } }],
    ["an authorizer with an empty id", { ...row, authorizer: { id: "", name: "Beto" } }],
    ["an authorizer without a name field", { ...row, authorizer: { id: "x" } }],
    ["a row without an authorizer field", { ...row, authorizer: undefined }],
    ["a negative refunded amount", { ...row, refunded: -1 }],
    ["a refunded amount with decimals", { ...row, refunded: 1.5 }],
    ["a line without an id", { ...row, lines: [{ ...line, sale_line_id: "" }] }],
    ["a line without a product name", { ...row, lines: [{ ...line, product_name: undefined }] }],
    ["a line without a sale unit", { ...row, lines: [{ ...line, sale_unit: undefined }] }],
    [
      "a line with a sale unit that does not exist",
      { ...row, lines: [{ ...line, sale_unit: "LITER" }] },
    ],
    ["a line of zero units", { ...row, lines: [{ ...line, quantity: 0 }] }],
    ["a line with a fraction of units", { ...row, lines: [{ ...line, quantity: 1.5 }] }],
    ["a reason that does not exist", { ...row, lines: [{ ...line, reason: "regalo" }] }],
    ["a line without a reason", { ...row, lines: [{ ...line, reason: undefined }] }],
    ["a disposition that does not exist", { ...row, lines: [{ ...line, disposition: "sell" }] }],
    ["a line without a disposition", { ...row, lines: [{ ...line, disposition: undefined }] }],
    ["a negative refunded line", { ...row, lines: [{ ...line, refunded: -1 }] }],
    ["a refunded line with decimals", { ...row, lines: [{ ...line, refunded: 1.5 }] }],
  ])("refuses %s", (_name, bad) => {
    expect(
      returnsReportSchema.safeParse({ ...report, typed: { rows: [bad], totals } }).success,
    ).toBe(false);
  });
});
