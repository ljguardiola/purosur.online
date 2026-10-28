import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import { fetchIssuedFiscalDocumentsReport } from "./issued-fiscal-documents-report-api";
import { issuedFiscalDocumentsReport } from "./test-support/issued-fiscal-documents-report-fixtures";

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
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, issuedFiscalDocumentsReport));

  expect(await fetchIssuedFiscalDocumentsReport({})).toEqual({
    kind: "ok",
    value: issuedFiscalDocumentsReport,
  });
  expect(fetch).toHaveBeenCalledWith("/api/reports/fiscal-documents");
});

test("asks for the range and the register chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, issuedFiscalDocumentsReport));

  await fetchIssuedFiscalDocumentsReport({
    from: "2026-10-01",
    to: "2026-10-07",
    register_id: FRONT_REGISTER_ID,
  });

  expect(fetch).toHaveBeenCalledWith(
    `/api/reports/fiscal-documents?from=2026-10-01&to=2026-10-07&register_id=${FRONT_REGISTER_ID}`,
  );
});

test("treats a body that does not match the report as failed", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, { ...issuedFiscalDocumentsReport, totals: {} }),
  );

  expect(await fetchIssuedFiscalDocumentsReport({})).toEqual({ kind: "failed" });
});

test("reports an unauthenticated answer", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await fetchIssuedFiscalDocumentsReport({})).toEqual({ kind: "unauthenticated" });
});

test("reports a forbidden answer", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await fetchIssuedFiscalDocumentsReport({})).toEqual({ kind: "forbidden" });
});
