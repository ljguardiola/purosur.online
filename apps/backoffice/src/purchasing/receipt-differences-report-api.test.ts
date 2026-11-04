import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fetchReceiptDifferencesReport } from "./receipt-differences-report-api";
import { receiptDifferencesReport } from "./test-support/receipt-differences-report-fixtures";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("asks for no range when none is chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(receiptDifferencesReport)));

  expect(await fetchReceiptDifferencesReport({})).toEqual({
    kind: "ok",
    value: receiptDifferencesReport,
  });
  expect(fetch).toHaveBeenCalledWith("/api/reports/receipt-differences");
});

test("asks for the range chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(receiptDifferencesReport)));

  await fetchReceiptDifferencesReport({ from: "2026-09-01", to: "2026-10-31" });

  expect(fetch).toHaveBeenCalledWith(
    "/api/reports/receipt-differences?from=2026-09-01&to=2026-10-31",
  );
});

test("treats a body that does not match the report's shape as a failed load", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ ...receiptDifferencesReport, totals: { suppliers: 1 } })),
  );

  expect(await fetchReceiptDifferencesReport({})).toEqual({ kind: "failed" });
});

test("answers a refusal as the cloud's outcome", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 403 }));

  expect(await fetchReceiptDifferencesReport({})).toEqual({ kind: "forbidden" });
});
