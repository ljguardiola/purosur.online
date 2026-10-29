import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fetchPurchasesReport } from "./purchases-report-api";
import { quarterPurchasesReport } from "./test-support/purchases-report-fixtures";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("asks for no range when none is chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(quarterPurchasesReport)));

  expect(await fetchPurchasesReport({})).toEqual({ kind: "ok", value: quarterPurchasesReport });
  expect(fetch).toHaveBeenCalledWith("/api/reports/purchases-by-supplier");
});

test("asks for the range chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(quarterPurchasesReport)));

  await fetchPurchasesReport({ from: "2026-09-01", to: "2026-10-31" });

  expect(fetch).toHaveBeenCalledWith(
    "/api/reports/purchases-by-supplier?from=2026-09-01&to=2026-10-31",
  );
});

test("treats a body that does not match the report's shape as a failed load", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ ...quarterPurchasesReport, totals: { amount: 1 } })),
  );

  expect(await fetchPurchasesReport({})).toEqual({ kind: "failed" });
});

test("answers a refusal as the cloud's outcome", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 403 }));

  expect(await fetchPurchasesReport({})).toEqual({ kind: "forbidden" });
});
