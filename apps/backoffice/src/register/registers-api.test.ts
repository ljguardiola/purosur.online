import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  createRegister,
  emitEnrollmentCode,
  fetchRegisterCoverage,
  fetchRegisterSyncStatus,
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

const register1: RegisterSummary = {
  id: "register-1",
  name: "Caja 1",
  pendingCode: null,
  pointOfSaleNumber: null,
  installation: null,
};
const register2Wire = {
  id: "register-2",
  name: "Caja 2",
  pending_code: { seconds_since_issued: 240, seconds_until_expiry: 660 },
  point_of_sale_number: 3,
  installation: null,
};
const register2: RegisterSummary = {
  id: "register-2",
  name: "Caja 2",
  pendingCode: { secondsSinceIssued: 240, secondsUntilExpiry: 660 },
  pointOfSaleNumber: 3,
  installation: null,
};

test("fetchRegisters lists every register, translating pending_code and point_of_sale_number from the wire", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, [
      {
        id: "register-1",
        name: "Caja 1",
        pending_code: null,
        point_of_sale_number: null,
        installation: null,
      },
      register2Wire,
    ]),
  );

  const outcome = await fetchRegisters();

  expect(outcome).toEqual({ kind: "ok", value: [register1, register2] });
  expect(fetch).toHaveBeenCalledWith("/api/registers");
});

test("fetchRegisters translates an enrolled and a revoked installation from the wire", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, [
      {
        id: "register-1",
        name: "Caja 1",
        pending_code: null,
        point_of_sale_number: null,
        installation: {
          state: "enrolled",
          hostname: "CAJA-MOSTRADOR",
          windows_version: "Windows 11 Pro 10.0.26100",
          enrolled_at: "2026-08-01T15:00:00.000Z",
        },
      },
      {
        id: "register-2",
        name: "Caja 2",
        pending_code: null,
        point_of_sale_number: null,
        installation: {
          state: "revoked",
          hostname: "CAJA-DEPOSITO",
          windows_version: "Windows 10 Pro 10.0.19045",
          enrolled_at: "2026-08-01T15:00:00.000Z",
          revoked_at: "2026-08-03T18:30:00.000Z",
        },
      },
    ]),
  );

  const outcome = await fetchRegisters();

  expect(outcome).toEqual({
    kind: "ok",
    value: [
      {
        ...register1,
        installation: {
          state: "enrolled",
          hostname: "CAJA-MOSTRADOR",
          windowsVersion: "Windows 11 Pro 10.0.26100",
          enrolledAt: "2026-08-01T15:00:00.000Z",
        },
      },
      {
        ...register1,
        id: "register-2",
        name: "Caja 2",
        installation: {
          state: "revoked",
          hostname: "CAJA-DEPOSITO",
          windowsVersion: "Windows 10 Pro 10.0.19045",
          enrolledAt: "2026-08-01T15:00:00.000Z",
          revokedAt: "2026-08-03T18:30:00.000Z",
        },
      },
    ],
  });
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
    "a pending code without its time until expiry",
    [{ id: "register-1", name: "Caja 1", pending_code: { seconds_since_issued: 240 } }],
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
  expect(fetch).toHaveBeenCalledWith("/api/registers", {
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

test("emitEnrollmentCode posts to the register's device-codes route and returns the code on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, { code: "P4NX7KWE2QRT8MZD", expires_at: "2026-09-25T12:15:00.000Z" }),
  );

  const outcome = await emitEnrollmentCode("register-2");

  expect(outcome).toEqual({
    kind: "ok",
    value: { code: "P4NX7KWE2QRT8MZD", expiresAt: "2026-09-25T12:15:00.000Z" },
  });
  expect(fetch).toHaveBeenCalledWith("/api/registers/register-2/device-codes", {
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
  expect(fetch).toHaveBeenCalledWith("/api/registers/coverage");
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

test("fetchRegisterSyncStatus lists each register with its last successful sync, translating the wire names", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, [
      { id: "register-1", name: "Caja 1", last_successful_sync_at: "2026-03-02T09:30:00.000Z" },
      { id: "register-2", name: "Caja 2", last_successful_sync_at: null },
    ]),
  );

  const outcome = await fetchRegisterSyncStatus();

  expect(outcome).toEqual({
    kind: "ok",
    value: [
      { id: "register-1", name: "Caja 1", lastSuccessfulSyncAt: "2026-03-02T09:30:00.000Z" },
      { id: "register-2", name: "Caja 2", lastSuccessfulSyncAt: null },
    ],
  });
  expect(fetch).toHaveBeenCalledWith("/api/registers/sync-status");
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
])("fetchRegisterSyncStatus answers a %i as %j", async (status, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

  expect(await fetchRegisterSyncStatus()).toEqual(outcome);
});

test("fetchRegisterSyncStatus returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "45" }));

  expect(await fetchRegisterSyncStatus()).toEqual({ kind: "rate_limited", retryAfterSeconds: 45 });
});

test("fetchRegisterSyncStatus returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await fetchRegisterSyncStatus()).toEqual({ kind: "failed" });
});

test("fetchRegisterSyncStatus returns failed on a body that is not a list of registers", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [{ id: "register-1", name: "Caja 1" }]));

  expect(await fetchRegisterSyncStatus()).toEqual({ kind: "failed" });
});
