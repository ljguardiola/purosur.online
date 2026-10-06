import { PASSKEY_AUTHORIZATION_WINDOW_MS } from "@purosur/domain";
import {
  FICTIONAL_CERTIFICATE_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import { asc, eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "../access/session-cookie.js";
import { generateSessionId, hashSessionId } from "../access/session-id.js";
import {
  auditLog,
  changes,
  ISSUER_IDENTIFICATION_SINGLETON_ID,
  issuerIdentification,
  issuerIdentificationVersions,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerIssuerIdentificationEditRoute } from "./issuer-identification-edit-route.js";
import { registerIssuerIdentificationReadRoute } from "./issuer-identification-read-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const TEST_AUTHORIZED_CUIT = FICTIONAL_CERTIFICATE_CUIT;
const NOON = new Date("2026-01-05T12:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();

  app = Fastify();
  registerIssuerIdentificationReadRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    authorizedCuit: TEST_AUTHORIZED_CUIT,
    now: () => NOON,
  });
  registerIssuerIdentificationEditRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    authorizedCuit: TEST_AUTHORIZED_CUIT,
    now: () => NOON,
  });
});

afterEach(async () => {
  await app.close();
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

async function insertSession(userId: string, authorizedAt: Date | null = NOON): Promise<string> {
  const rawSessionId = generateSessionId();
  await db.insert(sessions).values({
    userId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: NOON,
    lastSeenAt: NOON,
    passkeyAuthorizedAt: authorizedAt,
  });
  return rawSessionId;
}

function cookieHeader(rawSessionId: string): Record<string, string> {
  return { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` };
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    legal_name: FICTIONAL_LEGAL_NAME,
    gross_income_registration: FICTIONAL_GROSS_INCOME_REGISTRATION,
    activity_start_date: "2020-01-15",
    version: 1,
    ...overrides,
  };
}

function putIssuerIdentification(body: Record<string, unknown>, rawSessionId?: string) {
  return app.inject({
    method: "PUT",
    url: "/fiscal-settings/issuer-identification",
    headers: {
      origin: BACKOFFICE_ORIGIN,
      ...(rawSessionId ? cookieHeader(rawSessionId) : {}),
    },
    payload: body,
  });
}

function getIssuerIdentification(rawSessionId: string) {
  return app.inject({
    method: "GET",
    url: "/fiscal-settings/issuer-identification",
    headers: { origin: BACKOFFICE_ORIGIN, ...cookieHeader(rawSessionId) },
  });
}

describe("PUT /fiscal-settings/issuer-identification", () => {
  it("no longer answers PUT /fiscal-configuration/issuer-identification", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await app.inject({
      method: "PUT",
      url: "/fiscal-configuration/issuer-identification",
      headers: { origin: BACKOFFICE_ORIGIN, ...cookieHeader(rawSessionId) },
      payload: validBody(),
    });

    expect(response.statusCode).toBe(404);
  });

  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await putIssuerIdentification(validBody());

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await app.inject({
      method: "PUT",
      url: "/fiscal-settings/issuer-identification",
      headers: { origin: "https://attacker.example", ...cookieHeader(rawSessionId) },
      payload: validBody(),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user without the change_fiscal_configuration permission with 403 forbidden, changing nothing", async () => {
    const cashierRoleId = await insertRole("Cajera", ["sell_and_charge"]);
    const cashierId = await insertUser({
      firstName: "Grace Hopper",
      email: "grace@example.com",
      roleId: cashierRoleId,
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(cashierId);

    const response = await putIssuerIdentification(validBody(), rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    const [row] = await db
      .select()
      .from(issuerIdentification)
      .where(eq(issuerIdentification.id, ISSUER_IDENTIFICATION_SINGLETON_ID));
    expect(row).toMatchObject({ legalName: null, version: 1 });
  });

  it("saves and returns the new values, bumping the version", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await putIssuerIdentification(validBody(), rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      legal_name: FICTIONAL_LEGAL_NAME,
      gross_income_registration: FICTIONAL_GROSS_INCOME_REGISTRATION,
      activity_start_date: "2020-01-15",
      authorized_cuit: TEST_AUTHORIZED_CUIT,
      tax_status: "Responsable Monotributo",
      version: 2,
    });
    const [row] = await db
      .select()
      .from(issuerIdentification)
      .where(eq(issuerIdentification.id, ISSUER_IDENTIFICATION_SINGLETON_ID));
    expect(row).toMatchObject({ legalName: FICTIONAL_LEGAL_NAME, version: 2 });
  });

  it("makes the change visible to a subsequent GET", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);
    const putResponse = await putIssuerIdentification(validBody(), rawSessionId);
    expect(putResponse.statusCode).toBe(200);

    const getResponse = await getIssuerIdentification(rawSessionId);

    expect(getResponse.json()).toMatchObject({ legal_name: FICTIONAL_LEGAL_NAME, version: 2 });
  });

  it("audits the actor and the previous/new values in the same transaction", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await putIssuerIdentification(validBody(), rawSessionId);

    expect(response.statusCode).toBe(200);
    const [entry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, ISSUER_IDENTIFICATION_SINGLETON_ID));
    expect(entry).toMatchObject({
      entity: "issuer_identification",
      entityId: ISSUER_IDENTIFICATION_SINGLETON_ID,
      actorId: administratorId,
      previousValue: {
        legal_name: null,
        gross_income_registration: null,
        activity_start_date: null,
        version: 1,
      },
      newValue: {
        legal_name: FICTIONAL_LEGAL_NAME,
        gross_income_registration: FICTIONAL_GROSS_INCOME_REGISTRATION,
        activity_start_date: "2020-01-15",
        version: 2,
      },
      at: NOON,
    });
  });

  it("keeps every saved version, the one it replaced included, with the CUIT it was saved under and who saved it", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);

    await putIssuerIdentification(validBody(), rawSessionId);
    await putIssuerIdentification(
      validBody({ legal_name: "Comercio de Prueba Nuevo", version: 2 }),
      rawSessionId,
    );

    const versions = await db
      .select()
      .from(issuerIdentificationVersions)
      .orderBy(asc(issuerIdentificationVersions.version));
    expect(
      versions.map(
        ({
          version,
          legalName,
          grossIncomeRegistration,
          activityStartDate,
          authorizedCuit,
          recordedBy,
        }) => ({
          version,
          legalName,
          grossIncomeRegistration,
          activityStartDate,
          authorizedCuit,
          recordedBy,
        }),
      ),
    ).toEqual([
      {
        version: 1,
        legalName: null,
        grossIncomeRegistration: null,
        activityStartDate: null,
        authorizedCuit: null,
        recordedBy: null,
      },
      {
        version: 2,
        legalName: FICTIONAL_LEGAL_NAME,
        grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
        activityStartDate: "2020-01-15",
        authorizedCuit: TEST_AUTHORIZED_CUIT,
        recordedBy: administratorId,
      },
      {
        version: 3,
        legalName: "Comercio de Prueba Nuevo",
        grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
        activityStartDate: "2020-01-15",
        authorizedCuit: TEST_AUTHORIZED_CUIT,
        recordedBy: administratorId,
      },
    ]);
  });

  it("logs each saved version for the registers, at the identification's own id", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);
    const loggedBefore = await db.select().from(changes);

    await putIssuerIdentification(validBody(), rawSessionId);

    const logged = (await db.select().from(changes).orderBy(asc(changes.changeSeq))).slice(
      loggedBefore.length,
    );
    expect(logged).toMatchObject([
      {
        entity: "issuer_identification",
        entityId: ISSUER_IDENTIFICATION_SINGLETON_ID,
        version: 2,
        op: "update",
      },
    ]);
  });

  it("treats an unchanged save as a no-op: 200, version unchanged, no audit row", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);
    const first = await putIssuerIdentification(validBody(), rawSessionId);
    expect(first.statusCode).toBe(200);

    const response = await putIssuerIdentification(validBody({ version: 2 }), rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ legal_name: FICTIONAL_LEGAL_NAME, version: 2 });
    const [row] = await db
      .select()
      .from(issuerIdentification)
      .where(eq(issuerIdentification.id, ISSUER_IDENTIFICATION_SINGLETON_ID));
    expect(row).toMatchObject({ version: 2 });
    const audited = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, ISSUER_IDENTIFICATION_SINGLETON_ID));
    expect(audited).toHaveLength(1);
    expect(await db.select().from(issuerIdentificationVersions)).toHaveLength(2);
    expect(
      await db.select().from(changes).where(eq(changes.entity, "issuer_identification")),
    ).toHaveLength(1);
  });

  it("rejects an activity_start_date after the route clock's day with 400 validation_failed on that field, changing nothing", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await putIssuerIdentification(
      validBody({ activity_start_date: "2026-01-06" }),
      rawSessionId,
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "activity_start_date" }],
    });
    const [row] = await db
      .select()
      .from(issuerIdentification)
      .where(eq(issuerIdentification.id, ISSUER_IDENTIFICATION_SINGLETON_ID));
    expect(row).toMatchObject({ legalName: null, version: 1 });
  });

  it("returns 409 stale_version and changes nothing when the sent version does not match", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await putIssuerIdentification(validBody({ version: 2 }), rawSessionId);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "stale_version" });
    const [row] = await db
      .select()
      .from(issuerIdentification)
      .where(eq(issuerIdentification.id, ISSUER_IDENTIFICATION_SINGLETON_ID));
    expect(row).toMatchObject({ legalName: null, version: 1 });
    const audited = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, ISSUER_IDENTIFICATION_SINGLETON_ID));
    expect(audited).toHaveLength(0);
  });

  it("ignores an authorized_cuit sent by the client: the response still carries the deployment-configured one", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await putIssuerIdentification(
      validBody({ authorized_cuit: "30-99999999-9" }),
      rawSessionId,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ authorized_cuit: TEST_AUTHORIZED_CUIT });
  });

  describe("the shared passkey-authorization guard", () => {
    it("returns 401 authorization_required when the session's passkey authorization is stale, changing nothing", async () => {
      const administratorId = await insertUser({
        firstName: "Ada Lovelace",
        email: "ada@example.com",
        roleId: await seededAdministratorRoleId(),
        locationId: await seededLocationId(db),
      });
      const authorizedAt = new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS - 1000);
      const rawSessionId = await insertSession(administratorId, authorizedAt);

      const response = await putIssuerIdentification(validBody(), rawSessionId);

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "authorization_required" });
      const [row] = await db
        .select()
        .from(issuerIdentification)
        .where(eq(issuerIdentification.id, ISSUER_IDENTIFICATION_SINGLETON_ID));
      expect(row).toMatchObject({ legalName: null, version: 1 });
      const audited = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, ISSUER_IDENTIFICATION_SINGLETON_ID));
      expect(audited).toHaveLength(0);
    });

    it("checks validation before passkey authorization, the same order role-edit-route.ts uses", async () => {
      const administratorId = await insertUser({
        firstName: "Ada Lovelace",
        email: "ada@example.com",
        roleId: await seededAdministratorRoleId(),
        locationId: await seededLocationId(db),
      });
      const rawSessionId = await insertSession(administratorId, null);

      const response = await putIssuerIdentification(
        validBody({ legal_name: undefined }),
        rawSessionId,
      );

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "validation_failed" });
    });
  });
});
