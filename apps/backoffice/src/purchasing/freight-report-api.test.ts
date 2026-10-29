import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fetchFreightReport } from "./freight-report-api";
import { quarterFreightReport } from "./test-support/freight-report-fixtures";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("asks for no range when none is chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(quarterFreightReport)));

  expect(await fetchFreightReport({})).toEqual({ kind: "ok", value: quarterFreightReport });
  expect(fetch).toHaveBeenCalledWith("/api/reports/freight-by-period");
});

test("asks for the range chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(quarterFreightReport)));

  await fetchFreightReport({ from: "2026-09-01", to: "2026-10-31" });

  expect(fetch).toHaveBeenCalledWith(
    "/api/reports/freight-by-period?from=2026-09-01&to=2026-10-31",
  );
});

test("treats a body that does not match the report's shape as a failed load", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ ...quarterFreightReport, totals: { amount: 1 } })),
  );

  expect(await fetchFreightReport({})).toEqual({ kind: "failed" });
});

test("answers a refusal as the cloud's outcome", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 403 }));

  expect(await fetchFreightReport({})).toEqual({ kind: "forbidden" });
});
