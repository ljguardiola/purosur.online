import {
  SUPPLIER_PRICE_LIST_READ_FAILURES,
  SUPPLIER_PRICE_LIST_SOURCE_KINDS,
  SUPPLIER_PRICE_LIST_STATES,
} from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  supplierPriceListListSchema,
  supplierPriceListSummarySchema,
} from "./supplier-price-list-summary.js";

const extracted = {
  id: "list-1",
  supplier: { id: "s-1", name: "Distribuidora Sur" },
  sourceKind: "PDF",
  fileName: "lista-marzo.pdf",
  listDate: "2026-03-01",
  rowCount: 12,
  unpricedRowCount: 2,
  state: "EXTRACTED",
  readFailure: null,
  uploadedAt: "2026-03-01T12:00:00.000Z",
  replaced: false,
};
const failed = {
  ...extracted,
  id: "list-2",
  listDate: null,
  rowCount: 0,
  unpricedRowCount: 0,
  state: "READ_FAILED",
  readFailure: "unreadable_document",
};

describe("supplierPriceListSummarySchema", () => {
  it("accepts a list with rows and one that failed to be read", () => {
    expect(supplierPriceListSummarySchema.safeParse(extracted).data).toEqual(extracted);
    expect(supplierPriceListSummarySchema.safeParse(failed).data).toEqual(failed);
  });

  it("strips keys it does not define", () => {
    expect(
      supplierPriceListSummarySchema.safeParse({ ...extracted, storageKey: "bucket/x" }).data,
    ).toEqual(extracted);
  });

  it.each(Object.keys(extracted))("requires %s", (field) => {
    const { [field as keyof typeof extracted]: _omitted, ...rest } = extracted;

    expect(supplierPriceListSummarySchema.safeParse(rest).success).toBe(false);
  });

  it.each(SUPPLIER_PRICE_LIST_STATES)("accepts the state %s", (state) => {
    expect(supplierPriceListSummarySchema.safeParse({ ...extracted, state }).success).toBe(true);
  });

  it.each(SUPPLIER_PRICE_LIST_SOURCE_KINDS)("accepts the source kind %s", (sourceKind) => {
    expect(supplierPriceListSummarySchema.safeParse({ ...extracted, sourceKind }).success).toBe(
      true,
    );
  });

  it.each(SUPPLIER_PRICE_LIST_READ_FAILURES)("accepts the read failure %s", (readFailure) => {
    expect(supplierPriceListSummarySchema.safeParse({ ...extracted, readFailure }).success).toBe(
      true,
    );
  });

  it.each([
    ["state", "CONFIRMED"],
    ["sourceKind", "XLSX"],
    ["readFailure", "timeout"],
    ["rowCount", 1.5],
    ["unpricedRowCount", "2"],
    ["listDate", 20260301],
    ["uploadedAt", "yesterday"],
    ["replaced", "no"],
    ["supplier", { id: "s-1" }],
  ])("refuses %s as %j", (field, value) => {
    expect(supplierPriceListSummarySchema.safeParse({ ...extracted, [field]: value }).success).toBe(
      false,
    );
  });
});

describe("supplierPriceListListSchema", () => {
  it("accepts a list of lists, empty or not", () => {
    expect(supplierPriceListListSchema.safeParse([]).data).toEqual([]);
    expect(supplierPriceListListSchema.safeParse([extracted, failed]).data).toEqual([
      extracted,
      failed,
    ]);
  });

  it.each([undefined, null, {}, extracted])("refuses %j as a list", (body) => {
    expect(supplierPriceListListSchema.safeParse(body).success).toBe(false);
  });
});
