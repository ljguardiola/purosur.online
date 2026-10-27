import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BACK_REGISTER_ID, registers } from "../shell/test-support/report-fixtures";
import { fetchFiscalRegisters, fetchIssuedFiscalDocuments } from "./issued-fiscal-documents-api";
import { issuedFiscalDocuments } from "./test-support/issued-fiscal-documents-fixtures";

function jsonResponse(status: number, body?: unknown, headers?: Record<string, string>): Response {
  return new Response(
    body === undefined ? null : JSON.stringify(body),
    headers ? { status, headers } : { status },
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("reads the issued documents of the period the cloud answers for when none is asked", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, issuedFiscalDocuments));

  expect(await fetchIssuedFiscalDocuments({})).toEqual({
    kind: "ok",
    value: issuedFiscalDocuments,
  });
  expect(fetch).toHaveBeenCalledWith("/api/fiscal/documents");
});

test("asks for the range, the register, the kind, the number and the page given", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, issuedFiscalDocuments));

  await fetchIssuedFiscalDocuments({
    from: "2026-09-01",
    to: "2026-09-30",
    register_id: BACK_REGISTER_ID,
    kind: "credit_note",
    number: 41,
    page: 3,
  });

  const [path] = vi.mocked(fetch).mock.lastCall ?? [];
  const url = new URL(String(path), "http://backoffice.test");
  expect(url.pathname).toBe("/api/fiscal/documents");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    from: "2026-09-01",
    to: "2026-09-30",
    register_id: BACK_REGISTER_ID,
    kind: "credit_note",
    number: "41",
    page: "3",
  });
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
])("answers %i as %j", async (status, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

  expect(await fetchIssuedFiscalDocuments({})).toEqual(outcome);
});

test("reads the retry time of a rate-limited response", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "12" }));

  expect(await fetchIssuedFiscalDocuments({})).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 12,
  });
});

test("treats a body that does not match the issued documents as failed", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { documents: [{ kind: "receipt" }] }));

  expect(await fetchIssuedFiscalDocuments({})).toEqual({ kind: "failed" });
});

test("treats a request that cannot be made as failed", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));

  expect(await fetchIssuedFiscalDocuments({})).toEqual({ kind: "failed" });
});

test("reads the registers the documents can be filtered by", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, registers));

  expect(await fetchFiscalRegisters()).toEqual({ kind: "ok", value: registers });
  expect(fetch).toHaveBeenCalledWith("/api/fiscal/registers");
});

test("treats a registers body that does not match as failed", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { registers: [{ id: 1 }] }));

  expect(await fetchFiscalRegisters()).toEqual({ kind: "failed" });
});

test("answers a refused registers read as the cloud refused it", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await fetchFiscalRegisters()).toEqual({ kind: "forbidden" });
});
