import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  consultBitlockerRecoveryKey,
  loadBitlockerRecoveryKey,
} from "./bitlocker-recovery-key-api";

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

const RECOVERY_KEY = "111111-222222-333333-444444-555555-666666-707707-110000";
const loadBody = { recovery_key: RECOVERY_KEY, key_identifier: "1A2B3C4D" };

test("loadBitlockerRecoveryKey posts the key and its identifier to the register's key route", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 201 }));

  const outcome = await loadBitlockerRecoveryKey("register-2", loadBody);

  expect(outcome).toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith("/api/registers/register-2/bitlocker-recovery-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(loadBody),
  });
});

test("loadBitlockerRecoveryKey returns not_found on 404", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));

  expect(await loadBitlockerRecoveryKey("register-2", loadBody)).toEqual({ kind: "not_found" });
});

test.each(["no_current_installation", "already_loaded"] as const)(
  "loadBitlockerRecoveryKey returns %s on a 409 carrying that code",
  async (code) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code }));

    expect(await loadBitlockerRecoveryKey("register-2", loadBody)).toEqual({ kind: code });
  },
);

test("loadBitlockerRecoveryKey returns failed on a 409 carrying another code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "other" }));

  expect(await loadBitlockerRecoveryKey("register-2", loadBody)).toEqual({ kind: "failed" });
});

test("loadBitlockerRecoveryKey returns unauthenticated on a plain 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await loadBitlockerRecoveryKey("register-2", loadBody)).toEqual({
    kind: "unauthenticated",
  });
});

test("loadBitlockerRecoveryKey returns authorization_required on a 401 carrying that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authorization_required" }));

  expect(await loadBitlockerRecoveryKey("register-2", loadBody)).toEqual({
    kind: "authorization_required",
  });
});

test("loadBitlockerRecoveryKey returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await loadBitlockerRecoveryKey("register-2", loadBody)).toEqual({ kind: "forbidden" });
});

test("loadBitlockerRecoveryKey returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "20" }));

  expect(await loadBitlockerRecoveryKey("register-2", loadBody)).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 20,
  });
});

test("loadBitlockerRecoveryKey returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await loadBitlockerRecoveryKey("register-2", loadBody)).toEqual({ kind: "failed" });
});

test("consultBitlockerRecoveryKey posts to the register's consultations route and returns the key on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, loadBody));

  const outcome = await consultBitlockerRecoveryKey("register-2");

  expect(outcome).toEqual({
    kind: "ok",
    value: { recoveryKey: RECOVERY_KEY, keyIdentifier: "1A2B3C4D" },
  });
  expect(fetch).toHaveBeenCalledWith(
    "/api/registers/register-2/bitlocker-recovery-key/consultations",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
  );
});

test.each([
  ["without the identifier", { recovery_key: RECOVERY_KEY }],
  ["with a numeric key", { recovery_key: 1, key_identifier: "1A2B3C4D" }],
])("consultBitlockerRecoveryKey returns failed on a 200 %s", async (_name, body) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

  expect(await consultBitlockerRecoveryKey("register-2")).toEqual({ kind: "failed" });
});

test("consultBitlockerRecoveryKey returns failed on a 200 that is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("not json", { status: 200 }));

  expect(await consultBitlockerRecoveryKey("register-2")).toEqual({ kind: "failed" });
});

test("consultBitlockerRecoveryKey returns not_found on 404", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));

  expect(await consultBitlockerRecoveryKey("register-2")).toEqual({ kind: "not_found" });
});

test.each(["no_current_installation", "not_loaded"] as const)(
  "consultBitlockerRecoveryKey returns %s on a 409 carrying that code",
  async (code) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code }));

    expect(await consultBitlockerRecoveryKey("register-2")).toEqual({ kind: code });
  },
);

test("consultBitlockerRecoveryKey returns failed on a 409 carrying another code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "other" }));

  expect(await consultBitlockerRecoveryKey("register-2")).toEqual({ kind: "failed" });
});

test("consultBitlockerRecoveryKey returns unauthenticated on a plain 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await consultBitlockerRecoveryKey("register-2")).toEqual({ kind: "unauthenticated" });
});

test("consultBitlockerRecoveryKey returns authorization_required on a 401 carrying that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authorization_required" }));

  expect(await consultBitlockerRecoveryKey("register-2")).toEqual({
    kind: "authorization_required",
  });
});

test("consultBitlockerRecoveryKey returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await consultBitlockerRecoveryKey("register-2")).toEqual({ kind: "forbidden" });
});

test("consultBitlockerRecoveryKey returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "20" }));

  expect(await consultBitlockerRecoveryKey("register-2")).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 20,
  });
});

test("consultBitlockerRecoveryKey returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await consultBitlockerRecoveryKey("register-2")).toEqual({ kind: "failed" });
});
