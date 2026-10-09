import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { emitUserPinCode, fetchUserPasskeys, removeUserPasskey } from "./user-credentials-api";

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

test("fetchUserPasskeys lists the target user's passkeys on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, [
      {
        id: "pk-1",
        name: "Notebook del local",
        created_at: "2026-08-02T12:00:00.000Z",
        last_used_at: null,
      },
    ]),
  );

  const outcome = await fetchUserPasskeys("user-2");

  expect(outcome).toEqual({
    kind: "ok",
    value: [
      {
        id: "pk-1",
        name: "Notebook del local",
        createdAt: "2026-08-02T12:00:00.000Z",
        lastUsedAt: null,
      },
    ],
  });
  expect(fetch).toHaveBeenCalledWith("/api/users/user-2/passkeys");
});

test("fetchUserPasskeys reports failed on a 200 whose body is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("<!doctype html>", { status: 200 }));

  await expect(fetchUserPasskeys("user-2")).resolves.toEqual({ kind: "failed" });
});

test("fetchUserPasskeys reports failed on a 200 whose passkeys do not match the contract", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, [{ id: "pk-1", name: "Notebook", created_at: "2026-08-02T12:00:00.000Z" }]),
  );

  await expect(fetchUserPasskeys("user-2")).resolves.toEqual({ kind: "failed" });
});

test("fetchUserPasskeys reports not_found on 404", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));

  await expect(fetchUserPasskeys("missing")).resolves.toEqual({ kind: "not_found" });
});

test("fetchUserPasskeys reports forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403, { code: "forbidden" }));

  await expect(fetchUserPasskeys("user-2")).resolves.toEqual({ kind: "forbidden" });
});

test("fetchUserPasskeys reports unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "unauthenticated" }));

  await expect(fetchUserPasskeys("user-2")).resolves.toEqual({ kind: "unauthenticated" });
});

test("fetchUserPasskeys reports rate_limited with the Retry-After seconds on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(429, { code: "rate_limited" }, { "Retry-After": "75" }),
  );

  await expect(fetchUserPasskeys("user-2")).resolves.toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 75,
  });
});

test("fetchUserPasskeys reports failed on any other status or a network failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));
  await expect(fetchUserPasskeys("user-2")).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockRejectedValue(new TypeError("network down"));
  await expect(fetchUserPasskeys("user-2")).resolves.toEqual({ kind: "failed" });
});

test("removeUserPasskey deletes the passkey with no body and returns ok on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200));

  const outcome = await removeUserPasskey("user-2", "pk-1");

  expect(outcome).toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith("/api/users/user-2/passkeys/pk-1", { method: "DELETE" });
});

test("removeUserPasskey reports not_found on 404 for an unknown user or passkey", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));

  await expect(removeUserPasskey("user-2", "missing")).resolves.toEqual({ kind: "not_found" });
});

test("removeUserPasskey reports own_account on 403 with that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403, { code: "own_account" }));

  await expect(removeUserPasskey("user-1", "pk-1")).resolves.toEqual({ kind: "own_account" });
});

test("removeUserPasskey reports forbidden on 403 for a non-Administrator", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403, { code: "forbidden" }));

  await expect(removeUserPasskey("user-2", "pk-1")).resolves.toEqual({ kind: "forbidden" });
});

test("removeUserPasskey reports authorization_required on 401 with that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authorization_required" }));

  await expect(removeUserPasskey("user-2", "pk-1")).resolves.toEqual({
    kind: "authorization_required",
  });
});

test("removeUserPasskey reports unauthenticated on 401 with the unauthenticated code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "unauthenticated" }));

  await expect(removeUserPasskey("user-2", "pk-1")).resolves.toEqual({ kind: "unauthenticated" });
});

test("removeUserPasskey reports rate_limited with the Retry-After seconds on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(429, { code: "rate_limited" }, { "Retry-After": "40" }),
  );

  await expect(removeUserPasskey("user-2", "pk-1")).resolves.toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 40,
  });
});

test("removeUserPasskey reports failed on any other status or a network failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));
  await expect(removeUserPasskey("user-2", "pk-1")).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockRejectedValue(new TypeError("network down"));
  await expect(removeUserPasskey("user-2", "pk-1")).resolves.toEqual({ kind: "failed" });
});

test("emitUserPinCode posts to the user's pin-codes route with no body and returns the code and its expiry on 201", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(201, { code: "K7QM2XPA7DTR4HWN", expires_at: "2026-09-30T12:15:00.000Z" }),
  );

  const outcome = await emitUserPinCode("user-2");

  expect(outcome).toEqual({
    kind: "ok",
    value: { code: "K7QM2XPA7DTR4HWN", expiresAt: "2026-09-30T12:15:00.000Z" },
  });
  expect(fetch).toHaveBeenCalledWith("/api/users/user-2/pin-codes", { method: "POST" });
});

test.each([
  ["without a code", { expires_at: "2026-09-30T12:15:00.000Z" }],
  ["with a malformed code", { code: "short", expires_at: "2026-09-30T12:15:00.000Z" }],
  ["without an expiry", { code: "K7QM2XPA7DTR4HWN" }],
])("emitUserPinCode reports failed on a 201 %s", async (_name, body) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(201, body));

  await expect(emitUserPinCode("user-2")).resolves.toEqual({ kind: "failed" });
});

test("emitUserPinCode reports failed on a 201 that is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("not json", { status: 201 }));

  await expect(emitUserPinCode("user-2")).resolves.toEqual({ kind: "failed" });
});

test("emitUserPinCode reports not_found on 404", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));

  await expect(emitUserPinCode("user-2")).resolves.toEqual({ kind: "not_found" });
});

test("emitUserPinCode reports inactive on a 409 user_inactive", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "user_inactive" }));

  await expect(emitUserPinCode("user-2")).resolves.toEqual({ kind: "inactive" });
});

test("emitUserPinCode reports failed on any other 409", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "something_else" }));

  await expect(emitUserPinCode("user-2")).resolves.toEqual({ kind: "failed" });
});

test("emitUserPinCode reports authorization_required on 401 with that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authorization_required" }));

  await expect(emitUserPinCode("user-2")).resolves.toEqual({ kind: "authorization_required" });
});

test("emitUserPinCode reports unauthenticated on a plain 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "unauthenticated" }));

  await expect(emitUserPinCode("user-2")).resolves.toEqual({ kind: "unauthenticated" });
});

test("emitUserPinCode reports forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403, { code: "forbidden" }));

  await expect(emitUserPinCode("user-2")).resolves.toEqual({ kind: "forbidden" });
});

test("emitUserPinCode reports rate_limited with the Retry-After seconds on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "90" }));

  await expect(emitUserPinCode("user-2")).resolves.toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 90,
  });
});

test("emitUserPinCode reports failed on any other status or a network failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));
  await expect(emitUserPinCode("user-2")).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockRejectedValue(new TypeError("network down"));
  await expect(emitUserPinCode("user-2")).resolves.toEqual({ kind: "failed" });
});
