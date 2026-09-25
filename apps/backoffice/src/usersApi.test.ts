import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  type BranchUser,
  createUser,
  deactivateUser,
  editUser,
  fetchUser,
  fetchUserPasskeys,
  fetchUsers,
  removeUserPasskey,
} from "./usersApi";

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
  first_name: "Lucas Guardiola",
  email: "lucas@example.com",
  version: 1,
  role: { id: "role-admin", is_administrator: true, name: null },
  passkey_count: 2,
  is_last_active_administrator: false,
};
const administrator: BranchUser = {
  id: "user-1",
  firstName: "Lucas Guardiola",
  email: "lucas@example.com",
  version: 1,
  role: { id: "role-admin", isAdministrator: true, name: null },
  passkeyCount: 2,
  isLastActiveAdministrator: false,
};

test("fetchUsers lists the branch's users on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [administratorRow]));

  const outcome = await fetchUsers();

  expect(outcome).toEqual({ kind: "ok", value: [administrator] });
  expect(fetch).toHaveBeenCalledWith("/users");
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

const creationInput = {
  firstName: "Martina Gómez",
  email: "martina@example.com",
  roleId: "role-admin",
};

test("createUser posts the wire shape and returns the created user on 201", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(201, administratorRow));

  const outcome = await createUser(creationInput);

  expect(outcome).toEqual({ kind: "ok", value: administrator });
  expect(fetch).toHaveBeenCalledWith(
    "/users",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        first_name: "Martina Gómez",
        email: "martina@example.com",
        role_id: "role-admin",
      }),
    }),
  );
});

test("createUser reports failed on a 201 whose body is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("<!doctype html>", { status: 201 }));

  await expect(createUser(creationInput)).resolves.toEqual({ kind: "failed" });
});

test("createUser reports a validation_failed field on 400", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, { code: "validation_failed", details: [{ field: "email" }] }),
  );

  await expect(createUser(creationInput)).resolves.toEqual({
    kind: "validation_failed",
    field: "email",
  });
});

test("createUser maps every validation field to its camelCase name", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    jsonResponse(400, { code: "validation_failed", details: [{ field: "first_name" }] }),
  );
  await expect(createUser(creationInput)).resolves.toEqual({
    kind: "validation_failed",
    field: "firstName",
  });

  vi.mocked(fetch).mockResolvedValueOnce(
    jsonResponse(400, { code: "validation_failed", details: [{ field: "role_id" }] }),
  );
  await expect(createUser(creationInput)).resolves.toEqual({
    kind: "validation_failed",
    field: "roleId",
  });
});

test("createUser reports unknown_role on 400", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { code: "unknown_role" }));

  await expect(createUser(creationInput)).resolves.toEqual({
    kind: "unknown_role",
  });
});

test("createUser reports email_taken on 409", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "email_taken" }));

  await expect(createUser(creationInput)).resolves.toEqual({
    kind: "email_taken",
  });
});

test("createUser reports forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403, { code: "forbidden" }));

  await expect(createUser(creationInput)).resolves.toEqual({
    kind: "forbidden",
  });
});

test("createUser reports authorization_required on 401 with that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authorization_required" }));

  await expect(createUser(creationInput)).resolves.toEqual({
    kind: "authorization_required",
  });
});

test("createUser reports unauthenticated on 401 with the unauthenticated code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "unauthenticated" }));

  await expect(createUser(creationInput)).resolves.toEqual({
    kind: "unauthenticated",
  });
});

test("createUser reports rate_limited with the Retry-After seconds on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(429, { code: "rate_limited" }, { "Retry-After": "30" }),
  );

  await expect(createUser(creationInput)).resolves.toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 30,
  });
});

test("createUser reports failed on any other status or a network failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));
  await expect(createUser(creationInput)).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockRejectedValue(new TypeError("network down"));
  await expect(createUser(creationInput)).resolves.toEqual({ kind: "failed" });
});

test("fetchUser hands back the user on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, administratorRow));

  const outcome = await fetchUser("user-1");

  expect(outcome).toEqual({ kind: "ok", value: administrator });
  expect(fetch).toHaveBeenCalledWith("/users/user-1");
});

test("fetchUser reports not_found on 404", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));

  await expect(fetchUser("missing")).resolves.toEqual({ kind: "not_found" });
});

test("fetchUser reports forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403, { code: "forbidden" }));

  await expect(fetchUser("user-1")).resolves.toEqual({ kind: "forbidden" });
});

test("fetchUser reports unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "unauthenticated" }));

  await expect(fetchUser("user-1")).resolves.toEqual({ kind: "unauthenticated" });
});

test("fetchUser reports rate_limited with the Retry-After seconds on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(429, { code: "rate_limited" }, { "Retry-After": "20" }),
  );

  await expect(fetchUser("user-1")).resolves.toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 20,
  });
});

test("fetchUser reports failed on any other status or a network failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));
  await expect(fetchUser("user-1")).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockRejectedValue(new TypeError("network down"));
  await expect(fetchUser("user-1")).resolves.toEqual({ kind: "failed" });
});

test("fetchUser reports failed on a 200 whose body is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("<!doctype html>", { status: 200 }));

  await expect(fetchUser("user-1")).resolves.toEqual({ kind: "failed" });
});

const changedRow = {
  ...administratorRow,
  email: "new@example.com",
  role: { id: "role-shift", is_administrator: false, name: "Responsable de turno" },
  version: 2,
};
const changedUser: BranchUser = {
  ...administrator,
  email: "new@example.com",
  role: { id: "role-shift", isAdministrator: false, name: "Responsable de turno" },
  version: 2,
};
const editInput = { email: "new@example.com", roleId: "role-shift", version: 1 };

test("editUser posts the wire shape and returns the updated user on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, changedRow));

  const outcome = await editUser("user-1", editInput);

  expect(outcome).toEqual({ kind: "ok", value: changedUser });
  expect(fetch).toHaveBeenCalledWith(
    "/users/user-1/edit",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ email: "new@example.com", role_id: "role-shift", version: 1 }),
    }),
  );
});

test("editUser reports failed on a 200 whose body is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("<!doctype html>", { status: 200 }));

  await expect(editUser("user-1", editInput)).resolves.toEqual({ kind: "failed" });
});

test("editUser reports a validation_failed field on 400", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, { code: "validation_failed", details: [{ field: "email" }] }),
  );

  await expect(editUser("user-1", { ...editInput, email: "not-an-email" })).resolves.toEqual({
    kind: "validation_failed",
    field: "email",
  });
});

test("editUser maps the role_id validation field to its camelCase name", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, { code: "validation_failed", details: [{ field: "role_id" }] }),
  );

  await expect(editUser("user-1", editInput)).resolves.toEqual({
    kind: "validation_failed",
    field: "roleId",
  });
});

test("editUser maps the version validation field to its camelCase name", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, { code: "validation_failed", details: [{ field: "version" }] }),
  );

  await expect(editUser("user-1", editInput)).resolves.toEqual({
    kind: "validation_failed",
    field: "version",
  });
});

test("editUser reports email_taken on 409 with that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "email_taken" }));

  await expect(editUser("user-1", { ...editInput, email: "taken@example.com" })).resolves.toEqual({
    kind: "email_taken",
  });
});

test("editUser reports stale_version on 409 with that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "stale_version" }));

  await expect(editUser("user-1", editInput)).resolves.toEqual({ kind: "stale_version" });
});

test("editUser reports last_administrator on 409 with that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "last_administrator" }));

  await expect(editUser("user-1", editInput)).resolves.toEqual({ kind: "last_administrator" });
});

test("editUser reports not_found on 404", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));

  await expect(editUser("missing", editInput)).resolves.toEqual({ kind: "not_found" });
});

test("editUser reports authorization_required on 401 with that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authorization_required" }));

  await expect(editUser("user-1", editInput)).resolves.toEqual({
    kind: "authorization_required",
  });
});

test("editUser reports unauthenticated on 401 with the unauthenticated code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "unauthenticated" }));

  await expect(editUser("user-1", editInput)).resolves.toEqual({ kind: "unauthenticated" });
});

test("editUser reports forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403, { code: "forbidden" }));

  await expect(editUser("user-1", editInput)).resolves.toEqual({ kind: "forbidden" });
});

test("editUser reports rate_limited with the Retry-After seconds on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(429, { code: "rate_limited" }, { "Retry-After": "50" }),
  );

  await expect(editUser("user-1", editInput)).resolves.toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 50,
  });
});

test("editUser reports failed on any other status or a network failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));
  await expect(editUser("user-1", editInput)).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockRejectedValue(new TypeError("network down"));
  await expect(editUser("user-1", editInput)).resolves.toEqual({ kind: "failed" });
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
  expect(fetch).toHaveBeenCalledWith("/users/user-2/passkeys");
});

test("fetchUserPasskeys reports failed on a 200 whose body is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("<!doctype html>", { status: 200 }));

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

test("removeUserPasskey posts with no body and returns ok on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200));

  const outcome = await removeUserPasskey("user-2", "pk-1");

  expect(outcome).toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith(
    "/users/user-2/passkeys/pk-1/remove",
    expect.objectContaining({ method: "POST" }),
  );
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

test("deactivateUser posts with no body and returns ok on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200));

  const outcome = await deactivateUser("user-2");

  expect(outcome).toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith(
    "/users/user-2/deactivation",
    expect.objectContaining({ method: "POST" }),
  );
});

test("deactivateUser reports not_found on 404 for a missing, inactive, other-branch, or Administrator target", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));

  await expect(deactivateUser("user-2")).resolves.toEqual({ kind: "not_found" });
});

test("deactivateUser reports forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403, { code: "forbidden" }));

  await expect(deactivateUser("user-2")).resolves.toEqual({ kind: "forbidden" });
});

test("deactivateUser reports authorization_required on 401 with that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authorization_required" }));

  await expect(deactivateUser("user-2")).resolves.toEqual({ kind: "authorization_required" });
});

test("deactivateUser reports unauthenticated on 401 with the unauthenticated code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "unauthenticated" }));

  await expect(deactivateUser("user-2")).resolves.toEqual({ kind: "unauthenticated" });
});

test("deactivateUser reports rate_limited with the Retry-After seconds on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(429, { code: "rate_limited" }, { "Retry-After": "40" }),
  );

  await expect(deactivateUser("user-2")).resolves.toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 40,
  });
});

test("deactivateUser reports failed on any other status or a network failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));
  await expect(deactivateUser("user-2")).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockRejectedValue(new TypeError("network down"));
  await expect(deactivateUser("user-2")).resolves.toEqual({ kind: "failed" });
});
