import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fetchAccounts } from "./compromise-response-accounts-api";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ana = {
  id: "6f1d2b3c-4a5e-4f60-8a71-92b3c4d5e6f7",
  first_name: "Ana",
  email: "ana@example.com",
  version: 1,
  role: { id: "role-1", is_administrator: false, name: "Cajero" },
  passkey_count: 1,
  is_last_active_administrator: false,
  may_emit_pin_code: true,
  may_edit: true,
  may_deactivate: true,
  may_reactivate: false,
  may_remove_passkey: true,
};

test("fetchAccounts lists the users as the accounts that can be picked", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify([ana]), { status: 200 }));

  const outcome = await fetchAccounts();

  expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("/api/users");
  expect(outcome).toEqual({
    kind: "ok",
    value: [{ id: ana.id, firstName: "Ana", email: "ana@example.com" }],
  });
});

test("fetchAccounts fails on a body that does not match the users' shape", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify([{ id: "x" }]), { status: 200 }));

  expect(await fetchAccounts()).toEqual({ kind: "failed" });
});

test("fetchAccounts maps 401, 403, 429 and other failures", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }));
  expect(await fetchAccounts()).toEqual({ kind: "unauthenticated" });

  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 403 }));
  expect(await fetchAccounts()).toEqual({ kind: "forbidden" });

  vi.mocked(fetch).mockResolvedValue(
    new Response(null, { status: 429, headers: { "Retry-After": "9" } }),
  );
  expect(await fetchAccounts()).toEqual({ kind: "rate_limited", retryAfterSeconds: 9 });

  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));
  expect(await fetchAccounts()).toEqual({ kind: "failed" });

  vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));
  expect(await fetchAccounts()).toEqual({ kind: "failed" });
});
