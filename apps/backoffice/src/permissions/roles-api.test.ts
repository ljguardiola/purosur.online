import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createRole, editRole, fetchRole } from "./roles-api";

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

test("createRole posts the name and permissions and returns ok on 201", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(201, {}));

  const outcome = await createRole({ name: "Depósito", permissions: ["view_stock_balances"] });

  expect(outcome).toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith(
    "/api/roles",
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

  expect(await createRole({ name: "", permissions: [] })).toEqual({
    kind: "validation_failed",
    field: "name",
  });
});

test("createRole returns the field the server names as it is on the wire", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, { code: "validation_failed", details: [{ field: "permissions" }] }),
  );

  expect(await createRole({ name: "Depósito", permissions: [] })).toEqual({
    kind: "validation_failed",
    field: "permissions",
  });
});

test("createRole returns name_taken on 409", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "role_name_taken" }));

  expect(await createRole({ name: "Depósito", permissions: [] })).toEqual({
    kind: "name_taken",
  });
});

test("createRole returns authorization_required when the session has no valid passkey authorization", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authorization_required" }));

  expect(await createRole({ name: "Depósito", permissions: [] })).toEqual({
    kind: "authorization_required",
  });
});

test("createRole returns unauthenticated on a 401 with no matching code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await createRole({ name: "Depósito", permissions: [] })).toEqual({
    kind: "unauthenticated",
  });
});

test("createRole returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await createRole({ name: "Depósito", permissions: [] })).toEqual({
    kind: "forbidden",
  });
});

test("createRole returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "30" }));

  expect(await createRole({ name: "Depósito", permissions: [] })).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 30,
  });
});

test("createRole returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await createRole({ name: "Depósito", permissions: [] })).toEqual({
    kind: "failed",
  });
});

const stockDetailRow = {
  id: "role-stock",
  name: "Depósito",
  is_administrator: false,
  permissions: ["view_stock_balances"],
  user_count: 0,
  may_edit: true,
  version: 3,
  assigned_users: [],
};
const stockDetail = {
  id: "role-stock",
  name: "Depósito",
  isAdministrator: false,
  permissionKeys: ["view_stock_balances"],
  userCount: 0,
  mayEdit: true,
  version: 3,
  assignedUsers: [],
};

test("fetchRole reads one role's current values and version on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, stockDetailRow));

  const outcome = await fetchRole("role-stock");

  expect(outcome).toEqual({ kind: "ok", value: stockDetail });
  expect(fetch).toHaveBeenCalledWith("/api/roles/role-stock");
});

test("fetchRole parses the role's assigned people, in the order the server sent them", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, {
      ...stockDetailRow,
      user_count: 2,
      may_edit: true,
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
      mayEdit: true,
      assignedUsers: [
        { id: "user-1", name: "Amara Ortiz" },
        { id: "user-2", name: "Zoe Almeida" },
      ],
    },
  });
});

test("fetchRole returns failed on a 200 whose body does not match the contract", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ...stockDetailRow, version: "3" }));
  expect(await fetchRole("role-stock")).toEqual({ kind: "failed" });

  const { assigned_users: _omitted, ...withoutAssignedUsers } = stockDetailRow;
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, withoutAssignedUsers));
  expect(await fetchRole("role-stock")).toEqual({ kind: "failed" });
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

test("editRole puts the name, permissions and version and returns ok on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, {}));

  const outcome = await editRole("role-stock", {
    name: "Depósito",
    permissions: ["view_stock_balances"],
    version: 2,
  });

  expect(outcome).toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith(
    "/api/roles/role-stock",
    expect.objectContaining({
      method: "PUT",
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
    permissions: [],
    version: 1,
  });

  expect(outcome).toEqual({ kind: "validation_failed", field: "version" });
});

test("editRole returns a field the server names that only the wire knows", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, { code: "validation_failed", details: [{ field: "other" }] }),
  );

  const outcome = await editRole("role-stock", { name: "Depósito", permissions: [], version: 1 });

  expect(outcome).toEqual({ kind: "validation_failed", field: "other" });
});

test("editRole returns name_taken on a 409 role_name_taken", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "role_name_taken" }));

  const outcome = await editRole("role-stock", {
    name: "Depósito",
    permissions: [],
    version: 1,
  });

  expect(outcome).toEqual({ kind: "name_taken" });
});

test("editRole returns stale_version on a 409 stale_version", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "stale_version" }));

  const outcome = await editRole("role-stock", {
    name: "Depósito",
    permissions: [],
    version: 1,
  });

  expect(outcome).toEqual({ kind: "stale_version" });
});

test("editRole returns not_found on 404", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404));

  const outcome = await editRole("role-stock", {
    name: "Depósito",
    permissions: [],
    version: 1,
  });

  expect(outcome).toEqual({ kind: "not_found" });
});

test("editRole returns authorization_required when the session has no valid passkey authorization", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authorization_required" }));

  const outcome = await editRole("role-stock", {
    name: "Depósito",
    permissions: [],
    version: 1,
  });

  expect(outcome).toEqual({ kind: "authorization_required" });
});

test("editRole returns unauthenticated on a 401 with no matching code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  const outcome = await editRole("role-stock", {
    name: "Depósito",
    permissions: [],
    version: 1,
  });

  expect(outcome).toEqual({ kind: "unauthenticated" });
});

test("editRole returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  const outcome = await editRole("role-stock", {
    name: "Depósito",
    permissions: [],
    version: 1,
  });

  expect(outcome).toEqual({ kind: "forbidden" });
});

test("editRole returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "20" }));

  const outcome = await editRole("role-stock", {
    name: "Depósito",
    permissions: [],
    version: 1,
  });

  expect(outcome).toEqual({ kind: "rate_limited", retryAfterSeconds: 20 });
});

test("editRole returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  const outcome = await editRole("role-stock", {
    name: "Depósito",
    permissions: [],
    version: 1,
  });

  expect(outcome).toEqual({ kind: "failed" });
});

test("createRole returns ok on 201 whatever the body says, since the role is already created", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("not json", { status: 201 }));

  expect(await createRole({ name: "Depósito", permissions: [] })).toEqual({ kind: "ok" });
});

test("editRole returns ok on 200 whatever the body says, since the change is already applied", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("not json", { status: 200 }));

  expect(await editRole("role-stock", { name: "Depósito", permissions: [], version: 2 })).toEqual({
    kind: "ok",
  });
});
