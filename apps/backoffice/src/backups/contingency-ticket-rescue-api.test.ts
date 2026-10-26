import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { rescueContingencyBackupTicket } from "./contingency-ticket-rescue-api";

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

const rescuedWire = {
  outcome: "rescued",
  register_id: "6f1c1c5e-5b0a-4d6e-9d58-0c2f6f0d3a11",
  register_name: "Caja 1",
  received: 2,
  already_received: 0,
  summary: {
    operation: "sale",
    occurred_at: "2026-09-14T20:22:00.000Z",
    vouchers: [{ point_of_sale: 4, document_type: "factura_c", number: 301 }],
    sale_total: 894_000,
  },
};

test("sends every code of the ticket in one request and returns what the cloud answered", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, rescuedWire));

  expect(await rescueContingencyBackupTicket(["QR-1", "QR-2"])).toEqual({
    kind: "ok",
    value: rescuedWire,
  });
  expect(fetch).toHaveBeenCalledWith("/api/contingency-backup-tickets/rescue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ qr_codes: ["QR-1", "QR-2"] }),
  });
});

test.each([
  "unreadable",
  "incomplete",
  "unknown_key",
  "not_authentic",
  "foreign_installation",
  "conflicting",
])("returns a refusal of the cloud: %s", async (outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { outcome }));

  expect(await rescueContingencyBackupTicket(["QR-1"])).toEqual({
    kind: "ok",
    value: { outcome },
  });
});

test.each([
  [{ ...rescuedWire, received: "2" }],
  [{ ...rescuedWire, register_name: undefined }],
  [{ outcome: "exploded" }],
  [[rescuedWire]],
])("fails on a body that does not match its shape: %j", async (body) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

  expect(await rescueContingencyBackupTicket(["QR-1"])).toEqual({ kind: "failed" });
});

test("fails on a body that is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("<html>", { status: 200 }));

  expect(await rescueContingencyBackupTicket(["QR-1"])).toEqual({ kind: "failed" });
});

test.each([
  [401, undefined, { kind: "unauthenticated" }],
  [403, undefined, { kind: "forbidden" }],
  [429, { "Retry-After": "45" }, { kind: "rate_limited", retryAfterSeconds: 45 }],
  [429, undefined, { kind: "failed" }],
  [400, undefined, { kind: "failed" }],
  [500, undefined, { kind: "failed" }],
])("answers %s (retry header %j) as %j", async (status, headers, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status, undefined, headers));

  expect(await rescueContingencyBackupTicket(["QR-1"])).toEqual(outcome);
});

test("fails when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await rescueContingencyBackupTicket(["QR-1"])).toEqual({ kind: "failed" });
});
