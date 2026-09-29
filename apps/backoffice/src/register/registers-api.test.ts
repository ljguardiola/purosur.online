import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  createRegister,
  emitEnrollmentCode,
  fetchRegisterCoverage,
  fetchRegisters,
  type RegisterSummary,
} from "./registers-api";

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

const register1: RegisterSummary = { id: "register-1", name: "Caja 1", pendingCode: null };
const register2Wire = {
  id: "register-2",
  name: "Caja 2",
  pending_code: { issued_at: "2026-09-25T12:00:00.000Z", expires_at: "2026-09-25T12:15:00.000Z" },
};
const register2: RegisterSummary = {
  id: "register-2",
  name: "Caja 2",
  pendingCode: { issuedAt: "2026-09-25T12:00:00.000Z", expiresAt: "2026-09-25T12:15:00.000Z" },
};

test("fetchRegisters lists every register, translating pending_code from the wire", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, [{ id: "register-1", name: "Caja 1", pending_code: null }, register2Wire]),
  );

  const outcome = await fetchRegisters();

  expect(outcome).toEqual({ kind: "ok", value: [register1, register2] });
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

test.each([
  ["a body that is not a list", { not: "an array" }],
  ["a register without a name", [{ id: "register-1", pending_code: null }]],
  ["a register without its pending_code", [{ id: "register-1", name: "Caja 1" }]],
  [
    "a pending code without its expiry",
    [{ id: "register-1", name: "Caja 1", pending_code: { issued_at: "2026-09-25T12:00:00.000Z" } }],
  ],
])("fetchRegisters returns failed on %s", async (_name, body) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

  expect(await fetchRegisters()).toEqual({ kind: "failed" });
});

test("fetchRegisters returns failed on a 200 that is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("not json", { status: 200 }));

  expect(await fetchRegisters()).toEqual({ kind: "failed" });
});

test("createRegister posts the name and returns ok on 201", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(201, { id: "register-3", name: "Caja 3" }));

  const outcome = await createRegister({ name: "Caja 3" });

  expect(outcome).toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith("/registers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Caja 3" }),
  });
});

test.each([
  ["an empty body", jsonResponse(201)],
  ["a body that is not JSON", new Response("created", { status: 201 })],
  ["a body of another shape", jsonResponse(200, { created: true })],
])(
  "createRegister returns ok on a 2xx with %s, because the cloud already committed it",
  async (_name, response) => {
    vi.mocked(fetch).mockResolvedValue(response);

    expect(await createRegister({ name: "Caja 3" })).toEqual({ kind: "ok" });
  },
);

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

test("createRegister returns the wire field of a validation_failed 400 as the cloud named it", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, {
      code: "validation_failed",
      message: "unexpected",
      details: [{ field: "branch_id" }],
    }),
  );

  expect(await createRegister({ name: "Caja 3" })).toEqual({
    kind: "validation_failed",
    field: "branch_id",
  });
});

test("createRegister returns failed on a 400 that is not validation_failed", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { code: "bad_request" }));

  expect(await createRegister({ name: "Caja 3" })).toEqual({ kind: "failed" });
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

test.each([
  ["without a string code", { expires_at: "2026-09-25T12:15:00.000Z" }],
  ["with a numeric code", { code: 1, expires_at: "2026-09-25T12:15:00.000Z" }],
  ["without an expiry", { code: "P4NX7KWE2QRT8MZD" }],
  ["with a numeric expiry", { code: "P4NX7KWE2QRT8MZD", expires_at: 1 }],
])("emitEnrollmentCode returns failed on a 200 %s", async (_name, body) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

  expect(await emitEnrollmentCode("register-2")).toEqual({ kind: "failed" });
});

test("emitEnrollmentCode returns failed on a 200 that is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("not json", { status: 200 }));

  expect(await emitEnrollmentCode("register-2")).toEqual({ kind: "failed" });
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

test("fetchRegisterCoverage lists the permissions nobody active at the branch holds", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, { uncovered_permissions: ["void_sale", "correct_register_clock"] }),
  );

  const outcome = await fetchRegisterCoverage();

  expect(outcome).toEqual({ kind: "ok", value: ["void_sale", "correct_register_clock"] });
  expect(fetch).toHaveBeenCalledWith("/registers/coverage");
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
])("fetchRegisterCoverage answers a %i as %j", async (status, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

  expect(await fetchRegisterCoverage()).toEqual(outcome);
});

test("fetchRegisterCoverage returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "45" }));

  expect(await fetchRegisterCoverage()).toEqual({ kind: "rate_limited", retryAfterSeconds: 45 });
});

test("fetchRegisterCoverage returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await fetchRegisterCoverage()).toEqual({ kind: "failed" });
});

test.each([
  ["a body without the uncovered permissions", {}],
  ["an unknown permission", { uncovered_permissions: ["void_a_sale"] }],
])("fetchRegisterCoverage returns failed on %s", async (_name, body) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

  expect(await fetchRegisterCoverage()).toEqual({ kind: "failed" });
});
