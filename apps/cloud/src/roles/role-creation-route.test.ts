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
import { registerPasskeyRemovalRoutes } from "../passkeys/passkeys-removal-route.js";
import { registerRecoveryRedemptionRoutes } from "../recovery/recovery-redemption-route.js";
import { hashRecoveryToken } from "../recovery/recovery-token-hash.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerRoleCreationRoutes } from "./role-creation-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let recoveryApp: FastifyInstance;
let removalApp: FastifyInstance;
let administratorId: string;
let currentTime: Date;

async function buildApp() {
  const built = Fastify();
  registerRoleCreationRoutes(built, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => currentTime,
  });
  return built;
}

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

async function insertCashierRole(name: string): Promise<string> {
  const [role] = await db.insert(roles).values({ name, isAdministrator: false }).returning({
    id: roles.id,
  });
  if (!role) {
    throw new Error("test setup: seeding the role returned no row");
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

function getCreationOptions(rawSessionId?: string) {
  return app.inject({
    method: "POST",
    url: "/roles/creation-options",
    headers: {
      origin: BACKOFFICE_ORIGIN,
      ...(rawSessionId ? cookieHeader(rawSessionId) : {}),
    },
  });
}

async function requestCreationOptionsOrThrow(rawSessionId: string) {
  const response = await getCreationOptions(rawSessionId);
  if (response.statusCode !== 200) {
    throw new Error(`test setup: creation-options failed: ${response.statusCode} ${response.body}`);
  }
  return response.json();
}

async function reauthenticationFor(rawSessionId: string, emulator: WebAuthnEmulator) {
  const options = await requestCreationOptionsOrThrow(rawSessionId);
  return emulator.getJSON(BACKOFFICE_ORIGIN, options.reauthentication_options);
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
  app = await buildApp();
  recoveryApp = Fastify();
  registerRecoveryRedemptionRoutes(recoveryApp, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => currentTime,
  });
  removalApp = Fastify();
  registerPasskeyRemovalRoutes(removalApp, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => currentTime,
  });
});

afterEach(async () => {
  await app.close();
  await recoveryApp.close();
  await removalApp.close();
});

describe("POST /roles/creation-options", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await getCreationOptions();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await app.inject({
      method: "POST",
      url: "/roles/creation-options",
      headers: { origin: "https://attacker.example", ...cookieHeader(rawSessionId) },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a non-Administrator with 403 forbidden", async () => {
    const cashierRoleId = await insertCashierRole("Cajera");
    const cashierId = await insertUser({
      firstName: "Grace Hopper",
      email: "grace@example.com",
      roleId: cashierRoleId,
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(cashierId);

    const response = await getCreationOptions(rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("returns reauthentication options allowing only the Administrator's own passkeys", async () => {
    const emulator = newDeviceEmulator();
    await registerPasskey(administratorId, emulator);
    const rawSessionId = await insertSession(administratorId);
    const [ownPasskey] = await db
      .select()
      .from(passkeys)
      .where(eq(passkeys.userId, administratorId));

    const options = await requestCreationOptionsOrThrow(rawSessionId);

    expect(options.reauthentication_options).toMatchObject({ userVerification: "required" });
    const allowCredentials = options.reauthentication_options.allowCredentials as { id: string }[];
    expect(allowCredentials.map((c) => c.id)).toEqual([ownPasskey?.credentialId]);
  });
});

describe("POST /roles", () => {
  let emulator: WebAuthnEmulator;

  beforeEach(async () => {
    emulator = newDeviceEmulator();
    await registerPasskey(administratorId, emulator);
  });

  function createRole(
    rawSessionId: string | undefined,
    body: Record<string, unknown>,
    headers: Record<string, string> = {},
  ) {
    return postJson(
      app,
      "/roles",
      body,
      rawSessionId ? { ...cookieHeader(rawSessionId), ...headers } : headers,
    );
  }

  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await createRole(undefined, {});

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await app.inject({
      method: "POST",
      url: "/roles",
      headers: { origin: "https://attacker.example", ...cookieHeader(rawSessionId) },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a non-Administrator with 403 forbidden, creating nothing", async () => {
    const cashierRoleId = await insertCashierRole("Cajera");
    const cashierId = await insertUser({
      firstName: "Grace Hopper",
      email: "grace@example.com",
      roleId: cashierRoleId,
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(cashierId);

    const response = await createRole(rawSessionId, {
      name: "Depósito",
      permissions: ["view_stock_balances"],
      reauthentication: {},
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    const created = await db.select().from(roles).where(eq(roles.name, "Depósito"));
    expect(created).toHaveLength(0);
  });

  it("creates the role with exactly the chosen permissions and audits the actor", async () => {
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(rawSessionId, emulator);

    const response = await createRole(rawSessionId, {
      name: "Depósito",
      permissions: ["view_stock_balances", "adjust_stock"],
      reauthentication,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toEqual({
      id: body.id,
      name: "Depósito",
      is_administrator: false,
      permissions: ["view_stock_balances", "adjust_stock"],
      user_count: 0,
    });

    const [createdRole] = await db.select().from(roles).where(eq(roles.id, body.id));
    expect(createdRole).toMatchObject({ name: "Depósito", isAdministrator: false });
    const createdPermissions = await db
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, body.id));
    expect(createdPermissions.map((row) => row.permissionKey).sort()).toEqual(
      ["adjust_stock", "view_stock_balances"].sort(),
    );

    const audited = await db.select().from(auditLog).where(eq(auditLog.entity, "role"));
    const creationAudit = audited.find((row) => row.entityId === body.id);
    expect(creationAudit).toMatchObject({
      actorId: administratorId,
      previousValue: null,
      newValue: { name: "Depósito", permissions: ["view_stock_balances", "adjust_stock"] },
    });
  });

  it("creates a role holding no permissions", async () => {
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(rawSessionId, emulator);

    const response = await createRole(rawSessionId, {
      name: "Sin permisos",
      permissions: [],
      reauthentication,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ name: "Sin permisos", permissions: [] });
  });

  it("rejects an empty name, creating nothing", async () => {
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(rawSessionId, emulator);

    const response = await createRole(rawSessionId, {
      name: "   ",
      permissions: [],
      reauthentication,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "name" }],
    });
    const created = await db.select().from(roles).where(eq(roles.isAdministrator, false));
    expect(created).toHaveLength(0);
  });

  it("rejects the name Administrador, case-insensitively, creating nothing", async () => {
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(rawSessionId, emulator);

    const response = await createRole(rawSessionId, {
      name: "administrador",
      permissions: [],
      reauthentication,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "name" }],
    });
    const created = await db.select().from(roles).where(eq(roles.isAdministrator, false));
    expect(created).toHaveLength(0);
  });

  it("rejects a name already taken, case-insensitively, creating nothing", async () => {
    await insertCashierRole("Cajera");
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(rawSessionId, emulator);

    const response = await createRole(rawSessionId, {
      name: "CAJERA",
      permissions: [],
      reauthentication,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "role_name_taken" });
    const created = await db.select().from(roles).where(eq(roles.isAdministrator, false));
    expect(created).toHaveLength(1);
  });

  it("rejects an unknown permission key, creating nothing", async () => {
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(rawSessionId, emulator);

    const response = await createRole(rawSessionId, {
      name: "Depósito",
      permissions: ["not_a_real_permission"],
      reauthentication,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "permissions" }],
    });
    const created = await db.select().from(roles).where(eq(roles.isAdministrator, false));
    expect(created).toHaveLength(0);
  });

  it("rejects a repeated permission key, creating nothing", async () => {
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(rawSessionId, emulator);

    const response = await createRole(rawSessionId, {
      name: "Depósito",
      permissions: ["view_stock_balances", "view_stock_balances"],
      reauthentication,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "permissions" }],
    });
    const created = await db.select().from(roles).where(eq(roles.isAdministrator, false));
    expect(created).toHaveLength(0);
  });

  it("rejects both alert-view permissions together, creating nothing", async () => {
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(rawSessionId, emulator);

    const response = await createRole(rawSessionId, {
      name: "Encargada",
      permissions: ["view_branch_alerts", "view_all_alerts"],
      reauthentication,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "permissions" }],
    });
    const created = await db.select().from(roles).where(eq(roles.isAdministrator, false));
    expect(created).toHaveLength(0);
  });

  it("rejects a missing reauthentication, creating nothing", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await createRole(rawSessionId, {
      name: "Depósito",
      permissions: [],
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
    const created = await db.select().from(roles).where(eq(roles.isAdministrator, false));
    expect(created).toHaveLength(0);
  });

  it("rejects a reauthentication with no prior options request, creating nothing", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await createRole(rawSessionId, {
      name: "Depósito",
      permissions: [],
      reauthentication: { id: "not-a-real-credential" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
    const created = await db.select().from(roles).where(eq(roles.isAdministrator, false));
    expect(created).toHaveLength(0);
  });

  it("rejects a replayed reauthentication (consumes the challenge on first use), creating only one role", async () => {
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(rawSessionId, emulator);
    const body = { name: "Depósito", permissions: [], reauthentication };

    const first = await createRole(rawSessionId, body);
    expect(first.statusCode).toBe(201);

    const second = await createRole(rawSessionId, { ...body, name: "Segundo intento" });

    expect(second.statusCode).toBe(401);
    expect(second.json()).toMatchObject({ code: "authentication_failed" });
    const created = await db.select().from(roles).where(eq(roles.isAdministrator, false));
    expect(created).toHaveLength(1);
  });

  it("rejects a reauthentication whose signature was tampered with, creating nothing", async () => {
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(rawSessionId, emulator);
    const tampered = {
      ...reauthentication,
      response: {
        ...reauthentication.response,
        signature: `${reauthentication.response.signature.slice(0, -4)}AAAA`,
      },
    };

    const response = await createRole(rawSessionId, {
      name: "Depósito",
      permissions: [],
      reauthentication: tampered,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
    const created = await db.select().from(roles).where(eq(roles.isAdministrator, false));
    expect(created).toHaveLength(0);
    const audited = await db.select().from(auditLog).where(eq(auditLog.entity, "role"));
    expect(audited).toHaveLength(0);
  });

  it("rejects a reauthentication carrying another account's credential, creating nothing", async () => {
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
    const options = await requestCreationOptionsOrThrow(rawSessionId);
    const reauthentication = strangerEmulator.getJSON(BACKOFFICE_ORIGIN, {
      ...options.reauthentication_options,
      allowCredentials: [],
    });

    const response = await createRole(rawSessionId, {
      name: "Depósito",
      permissions: [],
      reauthentication,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
    const created = await db.select().from(roles).where(eq(roles.isAdministrator, false));
    expect(created).toHaveLength(0);
  });

  it("never accepts a removal challenge to create a role", async () => {
    const rawSessionId = await insertSession(administratorId);
    const removalOptionsResponse = await removalApp.inject({
      method: "POST",
      url: "/users/passkeys/removal-options",
      headers: { origin: BACKOFFICE_ORIGIN, ...cookieHeader(rawSessionId) },
    });
    if (removalOptionsResponse.statusCode !== 200) {
      throw new Error(`test setup: removal-options failed: ${removalOptionsResponse.statusCode}`);
    }
    const reauthentication = emulator.getJSON(
      BACKOFFICE_ORIGIN,
      removalOptionsResponse.json().reauthentication_options,
    );

    const response = await createRole(rawSessionId, {
      name: "Depósito",
      permissions: [],
      reauthentication,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
    const created = await db.select().from(roles).where(eq(roles.isAdministrator, false));
    expect(created).toHaveLength(0);
  });

  it("never accepts a role-creation challenge to remove a passkey", async () => {
    const [target] = await db.select().from(passkeys).where(eq(passkeys.userId, administratorId));
    if (!target) throw new Error("test setup: target passkey not found");
    const rawSessionId = await insertSession(administratorId);
    const options = await requestCreationOptionsOrThrow(rawSessionId);
    const reauthentication = emulator.getJSON(BACKOFFICE_ORIGIN, options.reauthentication_options);

    const response = await postJson(
      removalApp,
      `/users/passkeys/${target.id}/remove`,
      { reauthentication },
      cookieHeader(rawSessionId),
    );

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
    const remaining = await db.select().from(passkeys).where(eq(passkeys.userId, administratorId));
    expect(remaining).toHaveLength(1);
  });
});
