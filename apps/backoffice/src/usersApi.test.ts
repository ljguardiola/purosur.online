import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { type BranchUser, createUser, fetchUserCreationChallenge, fetchUsers } from "./usersApi";

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
  role: { id: "role-admin", is_administrator: true, name: null },
};
const administrator: BranchUser = {
  id: "user-1",
  firstName: "Lucas Guardiola",
  email: "lucas@example.com",
  role: { id: "role-admin", isAdministrator: true, name: null },
};

test("fetchUsers lists the branch's users on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [administratorRow]));

  const outcome = await fetchUsers();

  expect(outcome).toEqual({ kind: "ok", value: [administrator] });
  expect(fetch).toHaveBeenCalledWith("/users");
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

test("fetchUserCreationChallenge hands back reauthentication options on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, { reauthentication_options: { challenge: "reauth" } }),
  );

  const outcome = await fetchUserCreationChallenge();

  expect(outcome).toEqual({
    kind: "ok",
    value: { reauthenticationOptions: { challenge: "reauth" } },
  });
  expect(fetch).toHaveBeenCalledWith(
    "/users/creation-options",
    expect.objectContaining({
      method: "POST",
    }),
  );
});

test("fetchUserCreationChallenge reports forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403, { code: "forbidden" }));

  await expect(fetchUserCreationChallenge()).resolves.toEqual({ kind: "forbidden" });
});

test("fetchUserCreationChallenge reports unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "unauthenticated" }));

  await expect(fetchUserCreationChallenge()).resolves.toEqual({ kind: "unauthenticated" });
});

test("fetchUserCreationChallenge reports rate_limited with the Retry-After seconds on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(429, { code: "rate_limited" }, { "Retry-After": "45" }),
  );

  await expect(fetchUserCreationChallenge()).resolves.toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 45,
  });
});

test("fetchUserCreationChallenge reports failed on any other status or a network failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));
  await expect(fetchUserCreationChallenge()).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockRejectedValue(new TypeError("network down"));
  await expect(fetchUserCreationChallenge()).resolves.toEqual({ kind: "failed" });
});

test("fetchUserCreationChallenge reports failed on a 200 whose body is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("<!doctype html>", { status: 200 }));

  await expect(fetchUserCreationChallenge()).resolves.toEqual({ kind: "failed" });
});

const reauthentication = { id: "existing-cred" } as unknown as AuthenticationResponseJSON;
const creationInput = {
  firstName: "Martina Gómez",
  email: "martina@example.com",
  roleId: "role-admin",
};

test("createUser posts the wire shape and returns the created user on 201", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(201, administratorRow));

  const outcome = await createUser(creationInput, reauthentication);

  expect(outcome).toEqual({ kind: "ok", value: administrator });
  expect(fetch).toHaveBeenCalledWith(
    "/users",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        first_name: "Martina Gómez",
        email: "martina@example.com",
        role_id: "role-admin",
        reauthentication,
      }),
    }),
  );
});

test("createUser reports failed on a 201 whose body is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("<!doctype html>", { status: 201 }));

  await expect(createUser(creationInput, reauthentication)).resolves.toEqual({ kind: "failed" });
});

test("createUser reports a validation_failed field on 400", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, { code: "validation_failed", details: [{ field: "email" }] }),
  );

  await expect(createUser(creationInput, reauthentication)).resolves.toEqual({
    kind: "validation_failed",
    field: "email",
  });
});

test("createUser maps every validation field to its camelCase name", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    jsonResponse(400, { code: "validation_failed", details: [{ field: "first_name" }] }),
  );
  await expect(createUser(creationInput, reauthentication)).resolves.toEqual({
    kind: "validation_failed",
    field: "firstName",
  });

  vi.mocked(fetch).mockResolvedValueOnce(
    jsonResponse(400, { code: "validation_failed", details: [{ field: "role_id" }] }),
  );
  await expect(createUser(creationInput, reauthentication)).resolves.toEqual({
    kind: "validation_failed",
    field: "roleId",
  });
});

test("createUser reports unknown_role on 400", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { code: "unknown_role" }));

  await expect(createUser(creationInput, reauthentication)).resolves.toEqual({
    kind: "unknown_role",
  });
});

test("createUser reports email_taken on 409", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "email_taken" }));

  await expect(createUser(creationInput, reauthentication)).resolves.toEqual({
    kind: "email_taken",
  });
});

test("createUser reports forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403, { code: "forbidden" }));

  await expect(createUser(creationInput, reauthentication)).resolves.toEqual({
    kind: "forbidden",
  });
});

test("createUser reports authentication_failed on 401 with that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authentication_failed" }));

  await expect(createUser(creationInput, reauthentication)).resolves.toEqual({
    kind: "authentication_failed",
  });
});

test("createUser reports unauthenticated on 401 with the unauthenticated code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "unauthenticated" }));

  await expect(createUser(creationInput, reauthentication)).resolves.toEqual({
    kind: "unauthenticated",
  });
});

test("createUser reports rate_limited with the Retry-After seconds on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(429, { code: "rate_limited" }, { "Retry-After": "30" }),
  );

  await expect(createUser(creationInput, reauthentication)).resolves.toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 30,
  });
});

test("createUser reports failed on any other status or a network failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));
  await expect(createUser(creationInput, reauthentication)).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockRejectedValue(new TypeError("network down"));
  await expect(createUser(creationInput, reauthentication)).resolves.toEqual({ kind: "failed" });
});
