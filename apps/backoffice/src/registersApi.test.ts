import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  createRegister,
  emitEnrollmentCode,
  fetchRegisters,
  type RegisterSummary,
} from "./registersApi";

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

const caja1: RegisterSummary = { id: "register-1", name: "Caja 1", pendingCode: null };
const caja2Wire = {
  id: "register-2",
  name: "Caja 2",
  pending_code: { issued_at: "2026-09-25T12:00:00.000Z", expires_at: "2026-09-25T12:15:00.000Z" },
};
const caja2: RegisterSummary = {
  id: "register-2",
  name: "Caja 2",
  pendingCode: { issuedAt: "2026-09-25T12:00:00.000Z", expiresAt: "2026-09-25T12:15:00.000Z" },
};

test("fetchRegisters lists every register, translating pending_code from the wire", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, [{ id: "register-1", name: "Caja 1", pending_code: null }, caja2Wire]),
  );

  const outcome = await fetchRegisters();

  expect(outcome).toEqual({ kind: "ok", value: [caja1, caja2] });
  expect(fetch).toHaveBeenCalledWith("/registers");
});

test("fetchRegisters returns unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await fetchRegisters()).toEqual({ kind: "unauthenticated" });
});

test("fetchRegisters returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await fetchRegisters()).toEqual({ kind: "forbidden" });
});

test("fetchRegisters returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "45" }));

  expect(await fetchRegisters()).toEqual({ kind: "rate_limited", retryAfterSeconds: 45 });
});

test("fetchRegisters returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await fetchRegisters()).toEqual({ kind: "failed" });
});

test("fetchRegisters returns failed on a malformed body", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { not: "an array" }));

  expect(await fetchRegisters()).toEqual({ kind: "failed" });
});

test("createRegister posts the name and returns the created register on 201", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(201, { id: "register-3", name: "Caja 3" }));

  const outcome = await createRegister({ name: "Caja 3" });

  expect(outcome).toEqual({ kind: "ok", value: { id: "register-3", name: "Caja 3" } });
  expect(fetch).toHaveBeenCalledWith("/registers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Caja 3" }),
  });
});

test("createRegister returns validation_failed on the named field for a 400", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, {
      code: "validation_failed",
      message: "name must not be empty",
      details: [{ field: "name" }],
    }),
  );

  expect(await createRegister({ name: "" })).toEqual({
    kind: "validation_failed",
    field: "name",
  });
});

test("createRegister returns name_taken on 409", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(409, {
      code: "register_name_taken",
      message: "a register with that name already exists in this branch",
    }),
  );

  expect(await createRegister({ name: "Caja 1" })).toEqual({ kind: "name_taken" });
});

test("createRegister returns unauthenticated on a plain 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await createRegister({ name: "Caja 3" })).toEqual({ kind: "unauthenticated" });
});

test("createRegister returns authorization_required on a 401 carrying that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authorization_required" }));

  expect(await createRegister({ name: "Caja 3" })).toEqual({ kind: "authorization_required" });
});

test("createRegister returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await createRegister({ name: "Caja 3" })).toEqual({ kind: "forbidden" });
});

test("createRegister returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "30" }));

  expect(await createRegister({ name: "Caja 3" })).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 30,
  });
});

test("createRegister returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await createRegister({ name: "Caja 3" })).toEqual({ kind: "failed" });
});

test("emitEnrollmentCode posts to the register's enrollment-code route and returns the code on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, { code: "P4NX7KWE2QRT8MZD", expires_at: "2026-09-25T12:15:00.000Z" }),
  );

  const outcome = await emitEnrollmentCode("register-2");

  expect(outcome).toEqual({
    kind: "ok",
    value: { code: "P4NX7KWE2QRT8MZD", expiresAt: "2026-09-25T12:15:00.000Z" },
  });
  expect(fetch).toHaveBeenCalledWith("/registers/register-2/enrollment-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
});

test("emitEnrollmentCode returns not_found on 404", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));

  expect(await emitEnrollmentCode("register-2")).toEqual({ kind: "not_found" });
});

test("emitEnrollmentCode returns unauthenticated on a plain 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await emitEnrollmentCode("register-2")).toEqual({ kind: "unauthenticated" });
});

test("emitEnrollmentCode returns authorization_required on a 401 carrying that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authorization_required" }));

  expect(await emitEnrollmentCode("register-2")).toEqual({ kind: "authorization_required" });
});

test("emitEnrollmentCode returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await emitEnrollmentCode("register-2")).toEqual({ kind: "forbidden" });
});

test("emitEnrollmentCode returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "20" }));

  expect(await emitEnrollmentCode("register-2")).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 20,
  });
});

test("emitEnrollmentCode returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await emitEnrollmentCode("register-2")).toEqual({ kind: "failed" });
});
