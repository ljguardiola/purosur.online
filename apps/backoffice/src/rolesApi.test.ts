import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createRole, editRole, fetchRole, fetchRoles, type RoleSummary } from "./rolesApi";

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

test("createRole posts the name and permissions, returning the created role on 201", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(201, {
      id: "role-stock",
      name: "Depósito",
      is_administrator: false,
      permissions: ["view_stock_balances"],
      user_count: 0,
    }),
  );

  const outcome = await createRole({ name: "Depósito", permissionKeys: ["view_stock_balances"] });

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
      body: JSON.stringify({ name: "Depósito", permissions: ["view_stock_balances"] }),
    }),
  );
});

test("createRole returns validation_failed on the field the server names", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, { code: "validation_failed", details: [{ field: "name" }] }),
  );

  expect(await createRole({ name: "", permissionKeys: [] })).toEqual({
    kind: "validation_failed",
    field: "name",
  });
});

test("createRole returns name_taken on 409", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "role_name_taken" }));

  expect(await createRole({ name: "Depósito", permissionKeys: [] })).toEqual({
    kind: "name_taken",
  });
});

test("createRole returns authorization_required when the session has no valid passkey authorization", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authorization_required" }));

  expect(await createRole({ name: "Depósito", permissionKeys: [] })).toEqual({
    kind: "authorization_required",
  });
});

test("createRole returns unauthenticated on a 401 with no matching code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await createRole({ name: "Depósito", permissionKeys: [] })).toEqual({
    kind: "unauthenticated",
  });
});

test("createRole returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await createRole({ name: "Depósito", permissionKeys: [] })).toEqual({
    kind: "forbidden",
  });
});

test("createRole returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "30" }));

  expect(await createRole({ name: "Depósito", permissionKeys: [] })).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 30,
  });
});

test("createRole returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await createRole({ name: "Depósito", permissionKeys: [] })).toEqual({
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
  assigned_users: [],
};
const stockDetail = {
  id: "role-stock",
  name: "Depósito",
  isAdministrator: false,
  permissionKeys: ["view_stock_balances"],
  userCount: 0,
  version: 3,
  assignedUsers: [],
};

test("fetchRole reads one role's current values and version on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, stockDetailRow));

  const outcome = await fetchRole("role-stock");

  expect(outcome).toEqual({ kind: "ok", value: stockDetail });
  expect(fetch).toHaveBeenCalledWith("/roles/role-stock");
});

test("fetchRole parses the role's assigned people, in the order the server sent them", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, {
      ...stockDetailRow,
      user_count: 2,
      assigned_users: [
        { id: "user-1", name: "Amara Ortiz" },
        { id: "user-2", name: "Zoe Almeida" },
      ],
    }),
  );

  const outcome = await fetchRole("role-stock");

  expect(outcome).toEqual({
    kind: "ok",
    value: {
      ...stockDetail,
      userCount: 2,
      assignedUsers: [
        { id: "user-1", name: "Amara Ortiz" },
        { id: "user-2", name: "Zoe Almeida" },
      ],
    },
  });
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

test("editRole posts the name, permissions and version, returning the updated role on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, stockDetailRow));

  const outcome = await editRole("role-stock", {
    name: "Depósito",
    permissionKeys: ["view_stock_balances"],
    version: 2,
  });

  expect(outcome).toEqual({ kind: "ok", value: stockDetail });
  expect(fetch).toHaveBeenCalledWith(
    "/roles/role-stock/edit",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        name: "Depósito",
        permissions: ["view_stock_balances"],
        version: 2,
      }),
    }),
  );
});

test("editRole returns validation_failed on the field the server names", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, { code: "validation_failed", details: [{ field: "version" }] }),
  );

  const outcome = await editRole("role-stock", {
    name: "Depósito",
    permissionKeys: [],
    version: 1,
  });

  expect(outcome).toEqual({ kind: "validation_failed", field: "version" });
});

test("editRole returns name_taken on a 409 role_name_taken", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "role_name_taken" }));

  const outcome = await editRole("role-stock", {
    name: "Depósito",
    permissionKeys: [],
    version: 1,
  });

  expect(outcome).toEqual({ kind: "name_taken" });
});

test("editRole returns stale_version on a 409 stale_version", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "stale_version" }));

  const outcome = await editRole("role-stock", {
    name: "Depósito",
    permissionKeys: [],
    version: 1,
  });

  expect(outcome).toEqual({ kind: "stale_version" });
});

test("editRole returns not_found on 404", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404));

  const outcome = await editRole("role-stock", {
    name: "Depósito",
    permissionKeys: [],
    version: 1,
  });

  expect(outcome).toEqual({ kind: "not_found" });
});

test("editRole returns authorization_required when the session has no valid passkey authorization", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authorization_required" }));

  const outcome = await editRole("role-stock", {
    name: "Depósito",
    permissionKeys: [],
    version: 1,
  });

  expect(outcome).toEqual({ kind: "authorization_required" });
});

test("editRole returns unauthenticated on a 401 with no matching code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  const outcome = await editRole("role-stock", {
    name: "Depósito",
    permissionKeys: [],
    version: 1,
  });

  expect(outcome).toEqual({ kind: "unauthenticated" });
});

test("editRole returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  const outcome = await editRole("role-stock", {
    name: "Depósito",
    permissionKeys: [],
    version: 1,
  });

  expect(outcome).toEqual({ kind: "forbidden" });
});

test("editRole returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "20" }));

  const outcome = await editRole("role-stock", {
    name: "Depósito",
    permissionKeys: [],
    version: 1,
  });

  expect(outcome).toEqual({ kind: "rate_limited", retryAfterSeconds: 20 });
});

test("editRole returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  const outcome = await editRole("role-stock", {
    name: "Depósito",
    permissionKeys: [],
    version: 1,
  });

  expect(outcome).toEqual({ kind: "failed" });
});
