import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import WebAuthnEmulator, {
  AuthenticatorEmulator,
  PasskeysCredentialsMemoryRepository,
} from "nid-webauthn-emulator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import {
  auditLog,
  passkeys,
  recoveryTokens,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "../db/schema.js";
import { registerRecoveryRedemptionRoutes } from "../recovery/recovery-redemption-route.js";
import { hashRecoveryToken } from "../recovery/recovery-token-hash.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerRoleCreationRoutes } from "./role-creation-route.js";
import { registerRoleEditRoutes } from "./role-edit-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let creationApp: FastifyInstance;
let recoveryApp: FastifyInstance;
let administratorId: string;
let currentTime: Date;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

async function seededAdministratorRoleId(): Promise<string> {
  const [administratorRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.isAdministrator, true));
  if (!administratorRole) {
    throw new Error("test setup: no Administrator role seeded");
  }
  return administratorRole.id;
}

async function insertRole(name: string, permissionKeys: string[] = []): Promise<string> {
  const [role] = await db.insert(roles).values({ name, isAdministrator: false }).returning({
    id: roles.id,
  });
  if (!role) {
    throw new Error("test setup: seeding the role returned no row");
  }
  if (permissionKeys.length > 0) {
    await db
      .insert(rolePermissions)
      .values(permissionKeys.map((permissionKey) => ({ roleId: role.id, permissionKey })));
  }
  return role.id;
}

async function insertUser(input: {
  firstName: string;
  email: string;
  roleId: string;
  locationId: string;
}): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ firstName: input.firstName, email: input.email, locationId: input.locationId })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  await db.insert(userRoles).values({ userId: user.id, roleId: input.roleId });
  return user.id;
}

async function insertSession(userId: string): Promise<string> {
  const rawSessionId = generateSessionId();
  await db.insert(sessions).values({
    userId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: NOON,
    lastSeenAt: NOON,
  });
  return rawSessionId;
}

function cookieHeader(rawSessionId: string): Record<string, string> {
  return { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` };
}

function postJson(
  target: FastifyInstance,
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return target.inject({
    method: "POST",
    url,
    headers: { origin: BACKOFFICE_ORIGIN, ...headers },
    payload: body,
  });
}

let tokenSequence = 0;

function newDeviceEmulator(): WebAuthnEmulator {
  return new WebAuthnEmulator(
    new AuthenticatorEmulator({ credentialsRepository: new PasskeysCredentialsMemoryRepository() }),
  );
}

async function registerPasskey(
  forUserId: string,
  emulator: WebAuthnEmulator,
  name = "Notebook del local",
): Promise<void> {
  tokenSequence += 1;
  const rawToken = `raw-token-${tokenSequence}`;
  await db.insert(recoveryTokens).values({
    userId: forUserId,
    tokenHash: hashRecoveryToken(rawToken),
    issuedAt: currentTime,
    expiresAt: new Date(currentTime.getTime() + FIFTEEN_MINUTES_MS),
  });
  const optionsResponse = await recoveryApp.inject({
    method: "POST",
    url: "/users/recovery/registration-options",
    headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": "203.0.113.10" },
    payload: { recovery_token: rawToken },
  });
  if (optionsResponse.statusCode !== 200) {
    throw new Error(
      `test setup: registration-options failed: ${optionsResponse.statusCode} ${optionsResponse.body}`,
    );
  }
  const credential = emulator.createJSON(
    BACKOFFICE_ORIGIN,
    optionsResponse.json().passkey_registration_options,
  );
  const redeemResponse = await recoveryApp.inject({
    method: "POST",
    url: "/users/recovery/redeem",
    headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": "203.0.113.10" },
    payload: { recovery_token: rawToken, passkey_registration: credential, passkey_name: name },
  });
  if (redeemResponse.statusCode !== 200) {
    throw new Error(
      `test setup: redeem failed: ${redeemResponse.statusCode} ${redeemResponse.body}`,
    );
  }
}

function getEditOptions(roleId: string, rawSessionId?: string) {
  return app.inject({
    method: "POST",
    url: `/roles/${roleId}/edit-options`,
    headers: {
      origin: BACKOFFICE_ORIGIN,
      ...(rawSessionId ? cookieHeader(rawSessionId) : {}),
    },
  });
}

async function requestEditOptionsOrThrow(roleId: string, rawSessionId: string) {
  const response = await getEditOptions(roleId, rawSessionId);
  if (response.statusCode !== 200) {
    throw new Error(`test setup: edit-options failed: ${response.statusCode} ${response.body}`);
  }
  return response.json();
}

async function reauthenticationFor(
  roleId: string,
  rawSessionId: string,
  emulator: WebAuthnEmulator,
) {
  const options = await requestEditOptionsOrThrow(roleId, rawSessionId);
  return emulator.getJSON(BACKOFFICE_ORIGIN, options.reauthentication_options);
}

function editRoleRequest(
  roleId: string,
  rawSessionId: string | undefined,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return postJson(
    app,
    `/roles/${roleId}/edit`,
    body,
    rawSessionId ? { ...cookieHeader(rawSessionId), ...headers } : headers,
  );
}

beforeEach(async () => {
  await testDatabase.clear();
  tokenSequence = 0;

  const locationId = await seededLocationId(db);
  administratorId = await insertUser({
    firstName: "Ada Lovelace",
    email: "ada@example.com",
    roleId: await seededAdministratorRoleId(),
    locationId,
  });

  currentTime = NOON;
  app = Fastify();
  registerRoleEditRoutes(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => currentTime });
  creationApp = Fastify();
  registerRoleCreationRoutes(creationApp, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => currentTime,
  });
  recoveryApp = Fastify();
  registerRecoveryRedemptionRoutes(recoveryApp, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => currentTime,
  });
});

afterEach(async () => {
  await app.close();
  await creationApp.close();
  await recoveryApp.close();
});

describe("POST /roles/:id/edit-options", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const roleId = await insertRole("Cajera");

    const response = await getEditOptions(roleId);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await insertSession(administratorId);
    const roleId = await insertRole("Cajera");

    const response = await app.inject({
      method: "POST",
      url: `/roles/${roleId}/edit-options`,
      headers: { origin: "https://attacker.example", ...cookieHeader(rawSessionId) },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a non-Administrator with 403 forbidden", async () => {
    const cashierRoleId = await insertRole("Cajera");
    const cashierId = await insertUser({
      firstName: "Grace Hopper",
      email: "grace@example.com",
      roleId: cashierRoleId,
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(cashierId);

    const response = await getEditOptions(cashierRoleId, rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("answers the identical 404 for the Administrator role, a missing id, and a malformed one", async () => {
    const rawSessionId = await insertSession(administratorId);

    const administratorResponse = await getEditOptions(
      await seededAdministratorRoleId(),
      rawSessionId,
    );
    const missingResponse = await getEditOptions(
      "00000000-0000-0000-0000-000000000000",
      rawSessionId,
    );
    const malformedResponse = await getEditOptions("not-a-uuid", rawSessionId);

    expect(administratorResponse.statusCode).toBe(404);
    expect(missingResponse.statusCode).toBe(404);
    expect(malformedResponse.statusCode).toBe(404);
    expect(administratorResponse.json()).toEqual(missingResponse.json());
    expect(missingResponse.json()).toEqual(malformedResponse.json());
  });

  it("returns reauthentication options allowing only the Administrator's own passkeys", async () => {
    const emulator = newDeviceEmulator();
    await registerPasskey(administratorId, emulator);
    const rawSessionId = await insertSession(administratorId);
    const roleId = await insertRole("Cajera");
    const [ownPasskey] = await db
      .select()
      .from(passkeys)
      .where(eq(passkeys.userId, administratorId));

    const options = await requestEditOptionsOrThrow(roleId, rawSessionId);

    expect(options.reauthentication_options).toMatchObject({ userVerification: "required" });
    const allowCredentials = options.reauthentication_options.allowCredentials as { id: string }[];
    expect(allowCredentials.map((c) => c.id)).toEqual([ownPasskey?.credentialId]);
  });
});

describe("POST /roles/:id/edit", () => {
  let emulator: WebAuthnEmulator;
  let roleId: string;

  beforeEach(async () => {
    emulator = newDeviceEmulator();
    await registerPasskey(administratorId, emulator);
    roleId = await insertRole("Cajera", ["sell_and_charge"]);
  });

  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await editRoleRequest(roleId, undefined, {
      name: "Cajera",
      permissions: ["sell_and_charge"],
      version: 1,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await app.inject({
      method: "POST",
      url: `/roles/${roleId}/edit`,
      headers: { origin: "https://attacker.example", ...cookieHeader(rawSessionId) },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a non-Administrator with 403 forbidden, changing nothing", async () => {
    const cashierRoleId = await insertRole("Vendedora");
    const cashierId = await insertUser({
      firstName: "Grace Hopper",
      email: "grace@example.com",
      roleId: cashierRoleId,
      locationId: await seededLocationId(db),
    });
    const nonAdminSession = await insertSession(cashierId);

    const response = await editRoleRequest(roleId, nonAdminSession, {
      name: "Cajera nueva",
      permissions: [],
      version: 1,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    const [row] = await db.select().from(roles).where(eq(roles.id, roleId));
    expect(row).toMatchObject({ name: "Cajera", version: 1 });
  });

  it("answers the identical 404 for the Administrator role, a missing id, and a malformed one, changing nothing", async () => {
    const rawSessionId = await insertSession(administratorId);
    const body = { name: "Nuevo nombre", permissions: [], version: 1 };

    const administratorResponse = await editRoleRequest(
      await seededAdministratorRoleId(),
      rawSessionId,
      body,
    );
    const missingResponse = await editRoleRequest(
      "00000000-0000-0000-0000-000000000000",
      rawSessionId,
      body,
    );
    const malformedResponse = await editRoleRequest("not-a-uuid", rawSessionId, body);

    expect(administratorResponse.statusCode).toBe(404);
    expect(missingResponse.statusCode).toBe(404);
    expect(malformedResponse.statusCode).toBe(404);
    expect(administratorResponse.json()).toEqual(missingResponse.json());
    expect(missingResponse.json()).toEqual(malformedResponse.json());
  });

  it("rejects an empty name, changing nothing", async () => {
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(roleId, rawSessionId, emulator);

    const response = await editRoleRequest(roleId, rawSessionId, {
      name: "   ",
      permissions: [],
      version: 1,
      reauthentication,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "name" }],
    });
    const [row] = await db.select().from(roles).where(eq(roles.id, roleId));
    expect(row).toMatchObject({ name: "Cajera", version: 1 });
  });

  it("rejects the name Administrador, case-insensitively, changing nothing", async () => {
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(roleId, rawSessionId, emulator);

    const response = await editRoleRequest(roleId, rawSessionId, {
      name: "ADMINISTRADOR",
      permissions: [],
      version: 1,
      reauthentication,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "name" }],
    });
  });

  it("rejects an unknown permission key, changing nothing", async () => {
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(roleId, rawSessionId, emulator);

    const response = await editRoleRequest(roleId, rawSessionId, {
      name: "Cajera",
      permissions: ["not_a_real_permission"],
      version: 1,
      reauthentication,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "permissions" }],
    });
  });

  it("rejects both alert-view permissions together, changing nothing", async () => {
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(roleId, rawSessionId, emulator);

    const response = await editRoleRequest(roleId, rawSessionId, {
      name: "Cajera",
      permissions: ["view_branch_alerts", "view_all_alerts"],
      version: 1,
      reauthentication,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "permissions" }],
    });
  });

  it("rejects a missing or non-positive version, changing nothing", async () => {
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(roleId, rawSessionId, emulator);

    const response = await editRoleRequest(roleId, rawSessionId, {
      name: "Cajera",
      permissions: [],
      version: 0,
      reauthentication,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "version" }],
    });
  });

  it("rejects a missing reauthentication, changing nothing", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await editRoleRequest(roleId, rawSessionId, {
      name: "Cajera nueva",
      permissions: [],
      version: 1,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
    const [row] = await db.select().from(roles).where(eq(roles.id, roleId));
    expect(row).toMatchObject({ name: "Cajera", version: 1 });
  });

  it("rejects a reauthentication with no prior options request, changing nothing", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await editRoleRequest(roleId, rawSessionId, {
      name: "Cajera nueva",
      permissions: [],
      version: 1,
      reauthentication: { id: "not-a-real-credential" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
  });

  it("rejects a replayed reauthentication (consumes the challenge on first use), applying only one change", async () => {
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(roleId, rawSessionId, emulator);
    const body = { name: "Cajera nueva", permissions: [], version: 1, reauthentication };

    const first = await editRoleRequest(roleId, rawSessionId, body);
    expect(first.statusCode).toBe(200);

    const second = await editRoleRequest(roleId, rawSessionId, {
      ...body,
      name: "Segundo intento",
      version: 2,
    });

    expect(second.statusCode).toBe(401);
    expect(second.json()).toMatchObject({ code: "authentication_failed" });
    const [row] = await db.select().from(roles).where(eq(roles.id, roleId));
    expect(row).toMatchObject({ name: "Cajera nueva", version: 2 });
  });

  it("never accepts a role_creation challenge to edit a role, changing nothing", async () => {
    const rawSessionId = await insertSession(administratorId);
    const creationOptionsResponse = await creationApp.inject({
      method: "POST",
      url: "/roles/creation-options",
      headers: { origin: BACKOFFICE_ORIGIN, ...cookieHeader(rawSessionId) },
    });
    if (creationOptionsResponse.statusCode !== 200) {
      throw new Error(`test setup: creation-options failed: ${creationOptionsResponse.statusCode}`);
    }
    const reauthentication = emulator.getJSON(
      BACKOFFICE_ORIGIN,
      creationOptionsResponse.json().reauthentication_options,
    );

    const response = await editRoleRequest(roleId, rawSessionId, {
      name: "Cajera nueva",
      permissions: [],
      version: 1,
      reauthentication,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
    const [row] = await db.select().from(roles).where(eq(roles.id, roleId));
    expect(row).toMatchObject({ name: "Cajera", version: 1 });
  });

  it("rejects a reauthentication whose signature was tampered with, changing nothing", async () => {
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(roleId, rawSessionId, emulator);
    const tampered = {
      ...reauthentication,
      response: {
        ...reauthentication.response,
        signature: `${reauthentication.response.signature.slice(0, -4)}AAAA`,
      },
    };

    const response = await editRoleRequest(roleId, rawSessionId, {
      name: "Cajera nueva",
      permissions: [],
      version: 1,
      reauthentication: tampered,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
    const [row] = await db.select().from(roles).where(eq(roles.id, roleId));
    expect(row).toMatchObject({ name: "Cajera", version: 1 });
    const audited = await db.select().from(auditLog).where(eq(auditLog.entityId, roleId));
    expect(audited).toHaveLength(0);
  });

  it("rejects a reauthentication carrying another account's credential, changing nothing", async () => {
    const [strangerUser] = await db
      .insert(users)
      .values({
        firstName: "Stranger",
        email: "stranger-account@example.com",
        locationId: await seededLocationId(db),
      })
      .returning({ id: users.id });
    if (!strangerUser) throw new Error("test setup: seeding the stranger user returned no row");
    const strangerEmulator = newDeviceEmulator();
    await registerPasskey(strangerUser.id, strangerEmulator, "Passkey de una extraña");
    const rawSessionId = await insertSession(administratorId);
    const options = await requestEditOptionsOrThrow(roleId, rawSessionId);
    const reauthentication = strangerEmulator.getJSON(BACKOFFICE_ORIGIN, {
      ...options.reauthentication_options,
      allowCredentials: [],
    });

    const response = await editRoleRequest(roleId, rawSessionId, {
      name: "Cajera nueva",
      permissions: [],
      version: 1,
      reauthentication,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
    const [row] = await db.select().from(roles).where(eq(roles.id, roleId));
    expect(row).toMatchObject({ name: "Cajera", version: 1 });
    const audited = await db.select().from(auditLog).where(eq(auditLog.entityId, roleId));
    expect(audited).toHaveLength(0);
  });

  it("returns 409 stale_version and changes nothing when the sent version does not match", async () => {
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(roleId, rawSessionId, emulator);

    const response = await editRoleRequest(roleId, rawSessionId, {
      name: "Cajera nueva",
      permissions: [],
      version: 2,
      reauthentication,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "stale_version" });
    const [row] = await db.select().from(roles).where(eq(roles.id, roleId));
    expect(row).toMatchObject({ name: "Cajera", version: 1 });
    const audited = await db.select().from(auditLog).where(eq(auditLog.entityId, roleId));
    expect(audited).toHaveLength(0);
  });

  it("returns 409 role_name_taken and changes nothing when another role already has that name", async () => {
    await insertRole("Depósito");
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(roleId, rawSessionId, emulator);

    const response = await editRoleRequest(roleId, rawSessionId, {
      name: "DEPÓSITO",
      permissions: [],
      version: 1,
      reauthentication,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "role_name_taken" });
    const [row] = await db.select().from(roles).where(eq(roles.id, roleId));
    expect(row).toMatchObject({ name: "Cajera", version: 1 });
  });

  it("allows renaming a role to its own name in another case", async () => {
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(roleId, rawSessionId, emulator);

    const response = await editRoleRequest(roleId, rawSessionId, {
      name: "CAJERA",
      permissions: ["sell_and_charge"],
      version: 1,
      reauthentication,
    });

    expect(response.statusCode).toBe(200);
    const [row] = await db.select().from(roles).where(eq(roles.id, roleId));
    expect(row).toMatchObject({ name: "CAJERA", version: 2 });
  });

  it("accepts an unchanged name and permission set as a no-op: 200, version unchanged, no audit row", async () => {
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(roleId, rawSessionId, emulator);

    const response = await editRoleRequest(roleId, rawSessionId, {
      name: "Cajera",
      permissions: ["sell_and_charge"],
      version: 1,
      reauthentication,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: roleId, name: "Cajera", version: 1 });
    const [row] = await db.select().from(roles).where(eq(roles.id, roleId));
    expect(row).toMatchObject({ name: "Cajera", version: 1 });
    const audited = await db.select().from(auditLog).where(eq(auditLog.entityId, roleId));
    expect(audited).toHaveLength(0);
  });

  it("updates the name, replaces the permissions, bumps the version, audits actor/previous/new, and returns 200", async () => {
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(roleId, rawSessionId, emulator);
    const locationId = await seededLocationId(db);
    await insertUser({
      firstName: "Grace Hopper",
      email: "grace@example.com",
      roleId,
      locationId,
    });

    const response = await editRoleRequest(roleId, rawSessionId, {
      name: "Cajera senior",
      permissions: ["sell_and_charge", "adjust_stock"],
      version: 1,
      reauthentication,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: roleId,
      name: "Cajera senior",
      is_administrator: false,
      permissions: ["sell_and_charge", "adjust_stock"],
      user_count: 1,
      version: 2,
    });

    const [row] = await db.select().from(roles).where(eq(roles.id, roleId));
    expect(row).toMatchObject({ name: "Cajera senior", version: 2 });
    const storedPermissions = await db
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId));
    expect(storedPermissions.map((r) => r.permissionKey).sort()).toEqual(
      ["adjust_stock", "sell_and_charge"].sort(),
    );

    const audited = await db.select().from(auditLog).where(eq(auditLog.entity, "role"));
    const editAudit = audited.find((row) => row.entityId === roleId);
    expect(editAudit).toMatchObject({
      actorId: administratorId,
      previousValue: { name: "Cajera", permissions: ["sell_and_charge"] },
      newValue: { name: "Cajera senior", permissions: ["sell_and_charge", "adjust_stock"] },
    });
  });
});
