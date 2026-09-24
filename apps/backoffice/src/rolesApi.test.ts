import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  createRole,
  editRole,
  fetchRole,
  fetchRoleCreationChallenge,
  fetchRoleEditChallenge,
  fetchRoles,
  type RoleSummary,
} from "./rolesApi";

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

const reauthenticationOptions = { challenge: "reauth" } as never;
const reauthentication = { id: "existing-cred" } as unknown as AuthenticationResponseJSON;

test("fetchRoleCreationChallenge hands back the reauthentication options on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, { reauthentication_options: reauthenticationOptions }),
  );

  const outcome = await fetchRoleCreationChallenge();

  expect(outcome).toEqual({ kind: "ok", value: { reauthenticationOptions } });
  expect(fetch).toHaveBeenCalledWith(
    "/roles/creation-options",
    expect.objectContaining({ method: "POST" }),
  );
});

test("fetchRoleCreationChallenge returns unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await fetchRoleCreationChallenge()).toEqual({ kind: "unauthenticated" });
});

test("fetchRoleCreationChallenge returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await fetchRoleCreationChallenge()).toEqual({ kind: "forbidden" });
});

test("fetchRoleCreationChallenge returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "45" }));

  expect(await fetchRoleCreationChallenge()).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 45,
  });
});

test("fetchRoleCreationChallenge returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await fetchRoleCreationChallenge()).toEqual({ kind: "failed" });
});

test("createRole posts the name, permissions and reauthentication, returning the created role on 201", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(201, {
      id: "role-stock",
      name: "Depósito",
      is_administrator: false,
      permissions: ["view_stock_balances"],
      user_count: 0,
    }),
  );

  const outcome = await createRole(
    { name: "Depósito", permissionKeys: ["view_stock_balances"] },
    reauthentication,
  );

  expect(outcome).toEqual({
    kind: "ok",
    value: {
      id: "role-stock",
      name: "Depósito",
      isAdministrator: false,
      permissionKeys: ["view_stock_balances"],
      userCount: 0,
    },
  });
  expect(fetch).toHaveBeenCalledWith(
    "/roles",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        name: "Depósito",
        permissions: ["view_stock_balances"],
        reauthentication,
      }),
    }),
  );
});

test("createRole returns validation_failed on the field the server names", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, { code: "validation_failed", details: [{ field: "name" }] }),
  );

  expect(await createRole({ name: "", permissionKeys: [] }, reauthentication)).toEqual({
    kind: "validation_failed",
    field: "name",
  });
});

test("createRole returns name_taken on 409", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "role_name_taken" }));

  expect(await createRole({ name: "Depósito", permissionKeys: [] }, reauthentication)).toEqual({
    kind: "name_taken",
  });
});

test("createRole returns authentication_failed when the reauthentication itself is rejected", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authentication_failed" }));

  expect(await createRole({ name: "Depósito", permissionKeys: [] }, reauthentication)).toEqual({
    kind: "authentication_failed",
  });
});

test("createRole returns unauthenticated on a 401 with no code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await createRole({ name: "Depósito", permissionKeys: [] }, reauthentication)).toEqual({
    kind: "unauthenticated",
  });
});

test("createRole returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await createRole({ name: "Depósito", permissionKeys: [] }, reauthentication)).toEqual({
    kind: "forbidden",
  });
});

test("createRole returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "30" }));

  expect(await createRole({ name: "Depósito", permissionKeys: [] }, reauthentication)).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 30,
  });
});

test("createRole returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await createRole({ name: "Depósito", permissionKeys: [] }, reauthentication)).toEqual({
    kind: "failed",
  });
});

const stockDetailRow = {
  id: "role-stock",
  name: "Depósito",
  is_administrator: false,
  permissions: ["view_stock_balances"],
  user_count: 0,
  version: 3,
};
const stockDetail = {
  id: "role-stock",
  name: "Depósito",
  isAdministrator: false,
  permissionKeys: ["view_stock_balances"],
  userCount: 0,
  version: 3,
};

test("fetchRole reads one role's current values and version on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, stockDetailRow));

  const outcome = await fetchRole("role-stock");

  expect(outcome).toEqual({ kind: "ok", value: stockDetail });
  expect(fetch).toHaveBeenCalledWith("/roles/role-stock");
});

test("fetchRole returns not_found on 404", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404));

  expect(await fetchRole("role-admin")).toEqual({ kind: "not_found" });
});

test("fetchRole returns unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await fetchRole("role-stock")).toEqual({ kind: "unauthenticated" });
});

test("fetchRole returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await fetchRole("role-stock")).toEqual({ kind: "forbidden" });
});

test("fetchRole returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "90" }));

  expect(await fetchRole("role-stock")).toEqual({ kind: "rate_limited", retryAfterSeconds: 90 });
});

test("fetchRole returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await fetchRole("role-stock")).toEqual({ kind: "failed" });
});

test("fetchRoleEditChallenge hands back the reauthentication options on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, { reauthentication_options: reauthenticationOptions }),
  );

  const outcome = await fetchRoleEditChallenge("role-stock");

  expect(outcome).toEqual({ kind: "ok", value: { reauthenticationOptions } });
  expect(fetch).toHaveBeenCalledWith(
    "/roles/role-stock/edit-options",
    expect.objectContaining({ method: "POST" }),
  );
});

test("fetchRoleEditChallenge returns not_found on 404", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404));

  expect(await fetchRoleEditChallenge("role-stock")).toEqual({ kind: "not_found" });
});

test("fetchRoleEditChallenge returns unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await fetchRoleEditChallenge("role-stock")).toEqual({ kind: "unauthenticated" });
});

test("fetchRoleEditChallenge returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await fetchRoleEditChallenge("role-stock")).toEqual({ kind: "forbidden" });
});

test("fetchRoleEditChallenge returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "15" }));

  expect(await fetchRoleEditChallenge("role-stock")).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 15,
  });
});

test("fetchRoleEditChallenge returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await fetchRoleEditChallenge("role-stock")).toEqual({ kind: "failed" });
});

test("editRole posts the name, permissions, version and reauthentication, returning the updated role on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, stockDetailRow));

  const outcome = await editRole(
    "role-stock",
    { name: "Depósito", permissionKeys: ["view_stock_balances"], version: 2 },
    reauthentication,
  );

  expect(outcome).toEqual({ kind: "ok", value: stockDetail });
  expect(fetch).toHaveBeenCalledWith(
    "/roles/role-stock/edit",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        name: "Depósito",
        permissions: ["view_stock_balances"],
        version: 2,
        reauthentication,
      }),
    }),
  );
});

test("editRole returns validation_failed on the field the server names", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, { code: "validation_failed", details: [{ field: "version" }] }),
  );

  const outcome = await editRole(
    "role-stock",
    { name: "Depósito", permissionKeys: [], version: 1 },
    reauthentication,
  );

  expect(outcome).toEqual({ kind: "validation_failed", field: "version" });
});

test("editRole returns name_taken on a 409 role_name_taken", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "role_name_taken" }));

  const outcome = await editRole(
    "role-stock",
    { name: "Depósito", permissionKeys: [], version: 1 },
    reauthentication,
  );

  expect(outcome).toEqual({ kind: "name_taken" });
});

test("editRole returns stale_version on a 409 stale_version", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "stale_version" }));

  const outcome = await editRole(
    "role-stock",
    { name: "Depósito", permissionKeys: [], version: 1 },
    reauthentication,
  );

  expect(outcome).toEqual({ kind: "stale_version" });
});

test("editRole returns not_found on 404", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404));

  const outcome = await editRole(
    "role-stock",
    { name: "Depósito", permissionKeys: [], version: 1 },
    reauthentication,
  );

  expect(outcome).toEqual({ kind: "not_found" });
});

test("editRole returns authentication_failed when the reauthentication itself is rejected", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authentication_failed" }));

  const outcome = await editRole(
    "role-stock",
    { name: "Depósito", permissionKeys: [], version: 1 },
    reauthentication,
  );

  expect(outcome).toEqual({ kind: "authentication_failed" });
});

test("editRole returns unauthenticated on a 401 with no code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  const outcome = await editRole(
    "role-stock",
    { name: "Depósito", permissionKeys: [], version: 1 },
    reauthentication,
  );

  expect(outcome).toEqual({ kind: "unauthenticated" });
});

test("editRole returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  const outcome = await editRole(
    "role-stock",
    { name: "Depósito", permissionKeys: [], version: 1 },
    reauthentication,
  );

  expect(outcome).toEqual({ kind: "forbidden" });
});

test("editRole returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "20" }));

  const outcome = await editRole(
    "role-stock",
    { name: "Depósito", permissionKeys: [], version: 1 },
    reauthentication,
  );

  expect(outcome).toEqual({ kind: "rate_limited", retryAfterSeconds: 20 });
});

test("editRole returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  const outcome = await editRole(
    "role-stock",
    { name: "Depósito", permissionKeys: [], version: 1 },
    reauthentication,
  );

  expect(outcome).toEqual({ kind: "failed" });
});
