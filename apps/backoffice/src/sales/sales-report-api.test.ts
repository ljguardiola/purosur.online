import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import { fetchSalesByProductAndCategory, fetchSalesReport } from "./sales-report-api";
import { categoryProductsReport, weekReport } from "./test-support/sales-fixtures";

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("fetchSalesReport asks for no range and no register when none is chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, weekReport));

  expect(await fetchSalesReport({})).toEqual({ kind: "ok", value: weekReport });
  expect(fetch).toHaveBeenCalledWith("/api/reports/sales-by-day");
});

test("fetchSalesReport asks for the range and the register chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, weekReport));

  await fetchSalesReport({
    from: "2026-10-01",
    to: "2026-10-07",
    register_id: FRONT_REGISTER_ID,
  });

  expect(fetch).toHaveBeenCalledWith(
    `/api/reports/sales-by-day?from=2026-10-01&to=2026-10-07&register_id=${FRONT_REGISTER_ID}`,
  );
});

test("fetchSalesReport treats a body that does not match the report as failed", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ...weekReport, totals: { total: 1 } }));

  expect(await fetchSalesReport({})).toEqual({ kind: "failed" });
});

test("fetchSalesByProductAndCategory asks for the grouping alone when no range and no register are chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, categoryProductsReport));

  expect(await fetchSalesByProductAndCategory({ group: "category" })).toEqual({
    kind: "ok",
    value: categoryProductsReport,
  });
  expect(fetch).toHaveBeenCalledWith("/api/reports/sales-by-product-and-category?group=category");
});

test("fetchSalesByProductAndCategory asks for the grouping, the range and the register chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, categoryProductsReport));

  await fetchSalesByProductAndCategory({
    group: "product",
    from: "2026-10-01",
    to: "2026-10-07",
    register_id: FRONT_REGISTER_ID,
  });

  expect(fetch).toHaveBeenCalledWith(
    `/api/reports/sales-by-product-and-category?group=product&from=2026-10-01&to=2026-10-07&register_id=${FRONT_REGISTER_ID}`,
  );
});

test("fetchSalesByProductAndCategory treats a body that does not match the report as failed", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, { ...categoryProductsReport, totals: { units: 1 } }),
  );

  expect(await fetchSalesByProductAndCategory({ group: "category" })).toEqual({ kind: "failed" });
});

test.each([
  [401, "unauthenticated"],
  [403, "forbidden"],
])("fetchSalesByProductAndCategory answers a %s as the cloud's outcome", async (status, kind) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

  expect(await fetchSalesByProductAndCategory({ group: "category" })).toEqual({ kind });
});
