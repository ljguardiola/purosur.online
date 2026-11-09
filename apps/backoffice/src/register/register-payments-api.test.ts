import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { assignPointTerminal, assignQrPointOfSale } from "./register-payments-api";

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

const assignmentAnswer = { register_id: "register-1", terminal_id: "TERM-0042", version: 3 };

test("assignPointTerminal puts the terminal and the version, and returns ok on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, assignmentAnswer));

  const outcome = await assignPointTerminal("register-1", { terminal_id: "TERM-0042", version: 2 });

  expect(outcome).toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith("/api/registers/register-1/point-terminal", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ terminal_id: "TERM-0042", version: 2 }),
  });
});

test("assignPointTerminal sends a null terminal to remove the assignment", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ...assignmentAnswer, terminal_id: null }));

  expect(await assignPointTerminal("register-1", { terminal_id: null, version: 3 })).toEqual({
    kind: "ok",
  });
});

test("assignPointTerminal returns failed on a 200 of another shape", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { assigned: true }));

  expect(await assignPointTerminal("register-1", { terminal_id: "T", version: 0 })).toEqual({
    kind: "failed",
  });
});

test("assignPointTerminal returns validation_failed on the named field for a 400", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, {
      code: "validation_failed",
      message: "terminal_id must be a Point terminal id without spaces",
      details: [{ field: "terminal_id" }],
    }),
  );

  expect(await assignPointTerminal("register-1", { terminal_id: "A B", version: 0 })).toEqual({
    kind: "validation_failed",
    field: "terminal_id",
  });
});

test("assignPointTerminal returns not_found on 404", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));

  expect(await assignPointTerminal("register-9", { terminal_id: "T", version: 0 })).toEqual({
    kind: "not_found",
  });
});

test("assignPointTerminal tells a taken terminal from a stale version on 409", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    jsonResponse(409, { code: "point_terminal_taken", details: [{ field: "terminal_id" }] }),
  );
  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(409, { code: "stale_version" }));

  expect(await assignPointTerminal("register-1", { terminal_id: "T", version: 0 })).toEqual({
    kind: "point_terminal_taken",
  });
  expect(await assignPointTerminal("register-1", { terminal_id: "T", version: 0 })).toEqual({
    kind: "stale_version",
  });
});

test("assignPointTerminal returns failed on a 409 of another code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "conflict" }));

  expect(await assignPointTerminal("register-1", { terminal_id: "T", version: 0 })).toEqual({
    kind: "failed",
  });
});

test.each([
  ["a plain 401", jsonResponse(401), { kind: "unauthenticated" }],
  [
    "a 401 whatever its body",
    jsonResponse(401, { code: "authorization_required" }),
    { kind: "unauthenticated" },
  ],
  ["a 403", jsonResponse(403), { kind: "forbidden" }],
  [
    "a 429",
    jsonResponse(429, undefined, { "Retry-After": "30" }),
    { kind: "rate_limited", retryAfterSeconds: 30 },
  ],
  ["a 500", jsonResponse(500), { kind: "failed" }],
])("assignPointTerminal maps %s", async (_name, response, expected) => {
  vi.mocked(fetch).mockResolvedValue(response);

  expect(await assignPointTerminal("register-1", { terminal_id: "T", version: 0 })).toEqual(
    expected,
  );
});

test("assignPointTerminal returns failed when the request cannot be made", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("network"));

  expect(await assignPointTerminal("register-1", { terminal_id: "T", version: 0 })).toEqual({
    kind: "failed",
  });
});

const qrAssignmentAnswer = {
  register_id: "register-1",
  external_pos_id: "CAJA1_STORE_POS",
  version: 3,
};

test("assignQrPointOfSale puts the code and the version, and returns ok on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, qrAssignmentAnswer));

  const outcome = await assignQrPointOfSale("register-1", {
    external_pos_id: "CAJA1_STORE_POS",
    version: 2,
  });

  expect(outcome).toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith("/api/registers/register-1/qr-point-of-sale", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ external_pos_id: "CAJA1_STORE_POS", version: 2 }),
  });
});

test("assignQrPointOfSale sends a null code to remove the assignment", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, { ...qrAssignmentAnswer, external_pos_id: null }),
  );

  expect(await assignQrPointOfSale("register-1", { external_pos_id: null, version: 3 })).toEqual({
    kind: "ok",
  });
});

test("assignQrPointOfSale returns failed on a 200 of another shape", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { assigned: true }));

  expect(await assignQrPointOfSale("register-1", { external_pos_id: "P", version: 0 })).toEqual({
    kind: "failed",
  });
});

test("assignQrPointOfSale returns validation_failed on the named field for a 400", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, {
      code: "validation_failed",
      message: "external_pos_id must be a QR point of sale id without spaces",
      details: [{ field: "external_pos_id" }],
    }),
  );

  expect(await assignQrPointOfSale("register-1", { external_pos_id: "A B", version: 0 })).toEqual({
    kind: "validation_failed",
    field: "external_pos_id",
  });
});

test("assignQrPointOfSale returns not_found on 404", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));

  expect(await assignQrPointOfSale("register-9", { external_pos_id: "P", version: 0 })).toEqual({
    kind: "not_found",
  });
});

test("assignQrPointOfSale tells a taken code from a stale version on 409", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    jsonResponse(409, { code: "qr_point_of_sale_taken", details: [{ field: "external_pos_id" }] }),
  );
  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(409, { code: "stale_version" }));

  expect(await assignQrPointOfSale("register-1", { external_pos_id: "P", version: 0 })).toEqual({
    kind: "qr_point_of_sale_taken",
  });
  expect(await assignQrPointOfSale("register-1", { external_pos_id: "P", version: 0 })).toEqual({
    kind: "stale_version",
  });
});

test("assignQrPointOfSale returns failed on a 409 of another code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "conflict" }));

  expect(await assignQrPointOfSale("register-1", { external_pos_id: "P", version: 0 })).toEqual({
    kind: "failed",
  });
});

test.each([
  ["a plain 401", jsonResponse(401), { kind: "unauthenticated" }],
  ["a 403", jsonResponse(403), { kind: "forbidden" }],
  [
    "a 429",
    jsonResponse(429, undefined, { "Retry-After": "30" }),
    { kind: "rate_limited", retryAfterSeconds: 30 },
  ],
  ["a 500", jsonResponse(500), { kind: "failed" }],
])("assignQrPointOfSale maps %s", async (_name, response, expected) => {
  vi.mocked(fetch).mockResolvedValue(response);

  expect(await assignQrPointOfSale("register-1", { external_pos_id: "P", version: 0 })).toEqual(
    expected,
  );
});

test("assignQrPointOfSale returns failed when the request cannot be made", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("network"));

  expect(await assignQrPointOfSale("register-1", { external_pos_id: "P", version: 0 })).toEqual({
    kind: "failed",
  });
});
