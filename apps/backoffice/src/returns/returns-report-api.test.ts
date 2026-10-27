import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import { fetchReturnsReport } from "./returns-report-api";
import { returnsReport } from "./test-support/returns-fixtures";

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("asks for no range and no register when none is chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, returnsReport));

  expect(await fetchReturnsReport({})).toEqual({ kind: "ok", value: returnsReport });
  expect(fetch).toHaveBeenCalledWith("/api/reports/returns");
});

test("asks for the range and the register chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, returnsReport));

  await fetchReturnsReport({
    from: "2026-10-01",
    to: "2026-10-07",
    register_id: FRONT_REGISTER_ID,
  });

  expect(fetch).toHaveBeenCalledWith(
    `/api/reports/returns?from=2026-10-01&to=2026-10-07&register_id=${FRONT_REGISTER_ID}`,
  );
});

test("treats a body that does not match the report as failed", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ...returnsReport, typed: { rows: [] } }));

  expect(await fetchReturnsReport({})).toEqual({ kind: "failed" });
});

test("reports an unauthenticated answer", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await fetchReturnsReport({})).toEqual({ kind: "unauthenticated" });
});

test("reports a forbidden answer", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await fetchReturnsReport({})).toEqual({ kind: "forbidden" });
});
