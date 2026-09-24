import { randomUUID } from "node:crypto";
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
  locations,
  passkeys,
  recoveryTokens,
  roles,
  sessions,
  userRoles,
  users,
} from "../db/schema.js";
import { registerPasskeyRemovalRoutes } from "../passkeys/passkeys-removal-route.js";
import { processRecoveryRequestJob } from "../recovery/process-recovery-request-job.js";
import { registerRecoveryRedemptionRoutes } from "../recovery/recovery-redemption-route.js";
import { hashRecoveryToken } from "../recovery/recovery-token-hash.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerUserCreationRoutes } from "./user-creation-route.js";

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
  registerUserCreationRoutes(built, {
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

/** Registers a real passkey for `forUserId`, backed by `emulator`, through the recovery route. */
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
    url: "/users/creation-options",
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

describe("POST /users/creation-options", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await getCreationOptions();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await app.inject({
      method: "POST",
      url: "/users/creation-options",
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

describe("POST /users", () => {
  let emulator: WebAuthnEmulator;

  beforeEach(async () => {
    emulator = newDeviceEmulator();
    await registerPasskey(administratorId, emulator);
  });

  function createUser(
    rawSessionId: string | undefined,
    body: Record<string, unknown>,
    headers: Record<string, string> = {},
  ) {
    return postJson(
      app,
      "/users",
      body,
      rawSessionId ? { ...cookieHeader(rawSessionId), ...headers } : headers,
    );
  }

  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await createUser(undefined, {});

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await app.inject({
      method: "POST",
      url: "/users",
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

    const response = await createUser(rawSessionId, {
      first_name: "New Hire",
      email: "newhire@example.com",
      role_id: cashierRoleId,
      reauthentication: {},
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    const created = await db.select().from(users).where(eq(users.email, "newhire@example.com"));
    expect(created).toHaveLength(0);
  });

  it("creates the user in the session's branch with the chosen role, no passkeys, and audits the actor", async () => {
    const cashierRoleId = await insertCashierRole("Cajera");
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(rawSessionId, emulator);
    const locationId = await seededLocationId(db);

    const response = await createUser(rawSessionId, {
      first_name: "New Hire",
      email: "NewHire@Example.com",
      role_id: cashierRoleId,
      reauthentication,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toEqual({
      id: body.id,
      first_name: "New Hire",
      email: "newhire@example.com",
      version: 1,
      role: { id: cashierRoleId, is_administrator: false, name: "Cajera" },
      passkey_count: 0,
    });

    const [createdUser] = await db.select().from(users).where(eq(users.id, body.id));
    expect(createdUser).toMatchObject({
      firstName: "New Hire",
      email: "newhire@example.com",
      active: true,
      locationId,
    });
    const createdPasskeys = await db.select().from(passkeys).where(eq(passkeys.userId, body.id));
    expect(createdPasskeys).toHaveLength(0);
    const createdRoles = await db.select().from(userRoles).where(eq(userRoles.userId, body.id));
    expect(createdRoles).toEqual([{ userId: body.id, roleId: cashierRoleId }]);

    const audited = await db.select().from(auditLog).where(eq(auditLog.entity, "user"));
    const creationAudit = audited.find((row) => row.entityId === body.id);
    expect(creationAudit).toMatchObject({
      actorId: administratorId,
      previousValue: null,
      newValue: { firstName: "New Hire", email: "newhire@example.com", roleId: cashierRoleId },
    });
  });

  it("rejects a missing reauthentication, creating nothing", async () => {
    const cashierRoleId = await insertCashierRole("Cajera");
    const rawSessionId = await insertSession(administratorId);

    const response = await createUser(rawSessionId, {
      first_name: "New Hire",
      email: "newhire@example.com",
      role_id: cashierRoleId,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
    const created = await db.select().from(users).where(eq(users.email, "newhire@example.com"));
    expect(created).toHaveLength(0);
  });

  it("rejects a reauthentication with no prior options request, creating nothing", async () => {
    const cashierRoleId = await insertCashierRole("Cajera");
    const rawSessionId = await insertSession(administratorId);

    const response = await createUser(rawSessionId, {
      first_name: "New Hire",
      email: "newhire@example.com",
      role_id: cashierRoleId,
      reauthentication: { id: "not-a-real-credential" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
    const created = await db.select().from(users).where(eq(users.email, "newhire@example.com"));
    expect(created).toHaveLength(0);
  });

  it("rejects a reauthentication whose signature was tampered with, creating nothing", async () => {
    const cashierRoleId = await insertCashierRole("Cajera");
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(rawSessionId, emulator);
    const tampered = {
      ...reauthentication,
      response: {
        ...reauthentication.response,
        signature: `${reauthentication.response.signature.slice(0, -4)}AAAA`,
      },
    };

    const response = await createUser(rawSessionId, {
      first_name: "New Hire",
      email: "newhire@example.com",
      role_id: cashierRoleId,
      reauthentication: tampered,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
    const created = await db.select().from(users).where(eq(users.email, "newhire@example.com"));
    expect(created).toHaveLength(0);
  });

  it("rejects a reauthentication carrying another account's credential, creating nothing", async () => {
    const cashierRoleId = await insertCashierRole("Cajera");
    const strangerId = await insertUser({
      firstName: "Grace Hopper",
      email: "grace@example.com",
      roleId: cashierRoleId,
      locationId: await seededLocationId(db),
    });
    const strangerEmulator = newDeviceEmulator();
    await registerPasskey(strangerId, strangerEmulator, "Passkey de Grace");
    const rawSessionId = await insertSession(administratorId);
    const options = await requestCreationOptionsOrThrow(rawSessionId);
    const reauthentication = strangerEmulator.getJSON(BACKOFFICE_ORIGIN, {
      ...options.reauthentication_options,
      allowCredentials: [],
    });

    const response = await createUser(rawSessionId, {
      first_name: "New Hire",
      email: "newhire@example.com",
      role_id: cashierRoleId,
      reauthentication,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
    const created = await db.select().from(users).where(eq(users.email, "newhire@example.com"));
    expect(created).toHaveLength(0);
  });

  it("rejects a replayed reauthentication (consumes the challenge on first use), creating only one user", async () => {
    const cashierRoleId = await insertCashierRole("Cajera");
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(rawSessionId, emulator);
    const body = {
      first_name: "New Hire",
      email: "newhire@example.com",
      role_id: cashierRoleId,
      reauthentication,
    };

    const first = await createUser(rawSessionId, body);
    expect(first.statusCode).toBe(201);

    const second = await createUser(rawSessionId, {
      ...body,
      email: "second-attempt@example.com",
    });

    expect(second.statusCode).toBe(401);
    expect(second.json()).toMatchObject({ code: "authentication_failed" });
    const created = await db.select().from(users);
    expect(created).toHaveLength(2); // the seeded Administrator plus the one successful creation
  });

  it("rejects an unknown role id, creating nothing", async () => {
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(rawSessionId, emulator);

    const response = await createUser(rawSessionId, {
      first_name: "New Hire",
      email: "newhire@example.com",
      role_id: randomUUID(),
      reauthentication,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "unknown_role" });
    const created = await db.select().from(users).where(eq(users.email, "newhire@example.com"));
    expect(created).toHaveLength(0);
  });

  it("rejects a duplicate email with 409, creating nothing", async () => {
    const cashierRoleId = await insertCashierRole("Cajera");
    await insertUser({
      firstName: "Existing User",
      email: "taken@example.com",
      roleId: cashierRoleId,
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(rawSessionId, emulator);

    const response = await createUser(rawSessionId, {
      first_name: "New Hire",
      email: "Taken@Example.com",
      role_id: cashierRoleId,
      reauthentication,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "email_taken" });
    const matching = await db.select().from(users).where(eq(users.email, "taken@example.com"));
    expect(matching).toHaveLength(1);
  });

  it("ignores location/branch fields sent in the body, always using the session's own branch", async () => {
    const cashierRoleId = await insertCashierRole("Cajera");
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(rawSessionId, emulator);
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) throw new Error("test setup: seeding the other location returned no row");
    const sessionLocationId = await seededLocationId(db);

    const response = await createUser(rawSessionId, {
      first_name: "New Hire",
      email: "newhire@example.com",
      role_id: cashierRoleId,
      location_id: otherLocation.id,
      reauthentication,
    });

    expect(response.statusCode).toBe(201);
    const [createdUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, "newhire@example.com"));
    expect(createdUser?.locationId).toBe(sessionLocationId);
  });

  it("rejects an empty first name, creating nothing", async () => {
    const cashierRoleId = await insertCashierRole("Cajera");
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(rawSessionId, emulator);

    const response = await createUser(rawSessionId, {
      first_name: "   ",
      email: "newhire@example.com",
      role_id: cashierRoleId,
      reauthentication,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
    const created = await db.select().from(users).where(eq(users.email, "newhire@example.com"));
    expect(created).toHaveLength(0);
  });

  it("rejects a malformed email, creating nothing", async () => {
    const cashierRoleId = await insertCashierRole("Cajera");
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(rawSessionId, emulator);

    const response = await createUser(rawSessionId, {
      first_name: "New Hire",
      email: "not-an-email",
      role_id: cashierRoleId,
      reauthentication,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("lets the new user get in through the recovery link", async () => {
    const cashierRoleId = await insertCashierRole("Cajera");
    const rawSessionId = await insertSession(administratorId);
    const reauthentication = await reauthenticationFor(rawSessionId, emulator);

    const created = await createUser(rawSessionId, {
      first_name: "New Hire",
      email: "newhire@example.com",
      role_id: cashierRoleId,
      reauthentication,
    });
    expect(created.statusCode).toBe(201);

    const result = await processRecoveryRequestJob(
      db,
      {
        email: "newhire@example.com",
        requestedAt: currentTime.toISOString(),
        requestId: randomUUID(),
      },
      { now: () => currentTime, backofficeOrigin: BACKOFFICE_ORIGIN },
    );

    expect(result.send).toMatchObject({ to: "newhire@example.com" });
  });

  it("never accepts a removal challenge to create a user", async () => {
    const cashierRoleId = await insertCashierRole("Cajera");
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

    const response = await createUser(rawSessionId, {
      first_name: "New Hire",
      email: "newhire@example.com",
      role_id: cashierRoleId,
      reauthentication,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
    const createdRows = await db.select().from(users).where(eq(users.email, "newhire@example.com"));
    expect(createdRows).toHaveLength(0);
  });

  it("never accepts a user-creation challenge to remove a passkey", async () => {
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
