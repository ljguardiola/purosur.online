import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fetchRoles, type RoleSummary } from "./rolesApi";

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
  id: "role-admin",
  name: null,
  is_administrator: true,
  permissions: ["sell_and_charge"],
  user_count: 1,
};
const administrator: RoleSummary = {
  id: "role-admin",
  name: null,
  isAdministrator: true,
  permissionKeys: ["sell_and_charge"],
  userCount: 1,
};

test("fetchRoles lists every role on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [administratorRow]));

  const outcome = await fetchRoles();

  expect(outcome).toEqual({ kind: "ok", value: [administrator] });
  expect(fetch).toHaveBeenCalledWith("/roles");
});

test("fetchRoles maps a role with no users and no permissions", async () => {
  const stockRow = {
    id: "role-stock",
    name: "Depósito",
    is_administrator: false,
    permissions: [],
    user_count: 0,
  };
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [stockRow]));

  const outcome = await fetchRoles();

  expect(outcome).toEqual({
    kind: "ok",
    value: [
      {
        id: "role-stock",
        name: "Depósito",
        isAdministrator: false,
        permissionKeys: [],
        userCount: 0,
      },
    ],
  });
});

test("fetchRoles returns unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await fetchRoles()).toEqual({ kind: "unauthenticated" });
});

test("fetchRoles returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await fetchRoles()).toEqual({ kind: "forbidden" });
});

test("fetchRoles returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "120" }));

  expect(await fetchRoles()).toEqual({ kind: "rate_limited", retryAfterSeconds: 120 });
});

test("fetchRoles returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await fetchRoles()).toEqual({ kind: "failed" });
});

test("fetchRoles returns failed on a malformed body", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { not: "an array" }));

  expect(await fetchRoles()).toEqual({ kind: "failed" });
});
