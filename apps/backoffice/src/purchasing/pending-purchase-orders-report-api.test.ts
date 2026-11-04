import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fetchPendingPurchaseOrdersReport } from "./pending-purchase-orders-report-api";
import { pendingPurchaseOrdersReport } from "./test-support/pending-purchase-orders-report-fixtures";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("asks for no range when none is chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(pendingPurchaseOrdersReport)));

  expect(await fetchPendingPurchaseOrdersReport({})).toEqual({
    kind: "ok",
    value: pendingPurchaseOrdersReport,
  });
  expect(fetch).toHaveBeenCalledWith("/api/reports/pending-purchase-orders");
});

test("asks for the range chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(pendingPurchaseOrdersReport)));

  await fetchPendingPurchaseOrdersReport({ from: "2026-09-01", to: "2026-10-31" });

  expect(fetch).toHaveBeenCalledWith(
    "/api/reports/pending-purchase-orders?from=2026-09-01&to=2026-10-31",
  );
});

test("treats a body that does not match the report's shape as a failed load", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ ...pendingPurchaseOrdersReport, totals: { orders: 1 } })),
  );

  expect(await fetchPendingPurchaseOrdersReport({})).toEqual({ kind: "failed" });
});

test("answers a refusal as the cloud's outcome", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 403 }));

  expect(await fetchPendingPurchaseOrdersReport({})).toEqual({ kind: "forbidden" });
});
