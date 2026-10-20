import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { type BranchUser, fetchUsers } from "./branch-users-api";

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

const administratorRow = {
  id: "user-1",
  first_name: "Lucas Medrano",
  email: "lucas@example.com",
  version: 1,
  role: { id: "role-admin", is_administrator: true, name: null },
  passkey_count: 2,
  is_last_active_administrator: false,
  may_emit_pin_code: true,
  may_edit: true,
  may_deactivate: false,
  may_reactivate: false,
  may_remove_passkey: true,
};
const administrator: BranchUser = {
  id: "user-1",
  firstName: "Lucas Medrano",
  email: "lucas@example.com",
  version: 1,
  role: { id: "role-admin", isAdministrator: true, name: null },
  passkeyCount: 2,
  isLastActiveAdministrator: false,
  mayEmitPinCode: true,
  mayEdit: true,
  mayDeactivate: false,
  mayReactivate: false,
  mayRemovePasskey: true,
};

test("fetchUsers lists the branch's users on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [administratorRow]));

  const outcome = await fetchUsers();

  expect(outcome).toEqual({ kind: "ok", value: [administrator] });
  expect(fetch).toHaveBeenCalledWith("/api/users");
});

test("fetchUsers maps each user's version from the wire", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [{ ...administratorRow, version: 3 }]));

  const outcome = await fetchUsers();

  expect(outcome.kind).toBe("ok");
  expect(outcome.kind === "ok" && outcome.value[0]?.version).toBe(3);
});

test("fetchUsers maps each user's passkeyCount from the wire", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, [{ ...administratorRow, passkey_count: 5 }]),
  );

  const outcome = await fetchUsers();

  expect(outcome.kind).toBe("ok");
  expect(outcome.kind === "ok" && outcome.value[0]?.passkeyCount).toBe(5);
});

test("fetchUsers maps each user's isLastActiveAdministrator from the wire", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, [{ ...administratorRow, is_last_active_administrator: true }]),
  );

  const outcome = await fetchUsers();

  expect(outcome.kind).toBe("ok");
  expect(outcome.kind === "ok" && outcome.value[0]?.isLastActiveAdministrator).toBe(true);
});

test("fetchUsers maps each user's mayEmitPinCode from the wire", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, [{ ...administratorRow, may_emit_pin_code: false }]),
  );

  const outcome = await fetchUsers();

  expect(outcome.kind).toBe("ok");
  expect(outcome.kind === "ok" && outcome.value[0]?.mayEmitPinCode).toBe(false);
});

test.each([
  ["may_edit", "mayEdit"],
  ["may_deactivate", "mayDeactivate"],
  ["may_reactivate", "mayReactivate"],
  ["may_remove_passkey", "mayRemovePasskey"],
] as const)("fetchUsers maps each user's %s from the wire to %s", async (field, mapped) => {
  for (const answer of [true, false]) {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(200, [{ ...administratorRow, [field]: answer }]),
    );

    const outcome = await fetchUsers();

    expect(outcome.kind === "ok" && outcome.value[0]?.[mapped]).toBe(answer);
  }
});

test("fetchUsers maps each user's active field from the wire, when present", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [{ ...administratorRow, active: false }]));

  const outcome = await fetchUsers();

  expect(outcome.kind).toBe("ok");
  expect(outcome.kind === "ok" && outcome.value[0]?.active).toBe(false);
});

test("fetchUsers leaves active undefined on a row where the wire omits it", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [administratorRow]));

  const outcome = await fetchUsers();

  if (outcome.kind !== "ok") {
    throw new Error("expected an ok outcome");
  }
  const [user] = outcome.value;
  expect(user?.active).toBeUndefined();
  expect(user && "active" in user).toBe(false);
});

test("fetchUsers reports forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403, { code: "forbidden" }));

  await expect(fetchUsers()).resolves.toEqual({ kind: "forbidden" });
});

test("fetchUsers reports unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "unauthenticated" }));

  await expect(fetchUsers()).resolves.toEqual({ kind: "unauthenticated" });
});

test("fetchUsers reports rate_limited with the Retry-After seconds on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(429, { code: "rate_limited" }, { "Retry-After": "90" }),
  );

  await expect(fetchUsers()).resolves.toEqual({ kind: "rate_limited", retryAfterSeconds: 90 });
});

test("fetchUsers reports failed on any other status or a network failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));
  await expect(fetchUsers()).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockRejectedValue(new TypeError("network down"));
  await expect(fetchUsers()).resolves.toEqual({ kind: "failed" });
});

test("fetchUsers reports failed on a 200 whose body is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("<!doctype html>", { status: 200 }));

  await expect(fetchUsers()).resolves.toEqual({ kind: "failed" });
});

test("fetchUsers reports failed on a 200 whose users do not match the contract", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [{ ...administratorRow, version: "1" }]));
  await expect(fetchUsers()).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { users: [administratorRow] }));
  await expect(fetchUsers()).resolves.toEqual({ kind: "failed" });
});
