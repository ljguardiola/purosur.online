import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  locations,
  registers,
  revokedInstallationConfirmations,
} from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { insertInboxEvent } from "../sync/test-support/inbox-events.js";
import {
  BACKOFFICE_ORIGIN,
  type BackofficeSession,
  openBackofficeSession,
  SESSION_NOON,
} from "../test-support/backoffice-session.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleFortnightReportStore } from "./drizzle-fortnight-report-store.js";
import { DrizzleOfflineAuthorizationCodeStore } from "./drizzle-offline-authorization-code-store.js";
import { registerRevokedInstallationConfirmationRoute } from "./revoked-installation-confirmation-route.js";
import { configureOfflinePointOfSale } from "./test-support/offline-point-of-sale-fixtures.js";
import { WITHOUT_CREDIT_NOTES } from "./test-support/rejected-document-remedy-fixtures.js";

const FORTNIGHT = { start: "2026-10-01", end: "2026-10-15" };
const ENROLLED_AT = new Date("2026-10-05T12:00:00.000Z");
const REVOKED_AT = new Date("2026-10-10T12:00:00.000Z");

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
  registerRevokedInstallationConfirmationRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => SESSION_NOON,
    zoneRules: fixedZoneRulesSource(),
  });
});

afterEach(async () => {
  await app.close();
});

function sessionWith(
  permissionKeys: string[],
  passkeyAuthorized = true,
): Promise<BackofficeSession> {
  return seededLocationId(db).then((locationId) =>
    openBackofficeSession(db, {
      now: SESSION_NOON,
      locationId,
      permissionKeys,
      passkeyAuthorized,
    }),
  );
}

async function seedRevokedInstallation() {
  const registerId = await configureOfflinePointOfSale(db, {
    registerName: "caja-1",
    realTimePointOfSale: 7,
    offlinePointOfSale: 8,
    now: SESSION_NOON,
  });
  await new DrizzleOfflineAuthorizationCodeStore(db).holdAcquisition(FORTNIGHT, (acquisition) =>
    acquisition.keep({
      code: { code: "36123456789012", fortnight: FORTNIGHT, reportDeadline: "2026-10-20" },
      obtainedAt: new Date("2026-09-28T12:00:00.000Z"),
      obtainedThrough: "requested",
    }),
  );
  const { deviceId } = await insertEnrolledInstallation(db, {
    now: SESSION_NOON,
    existingRegisterId: registerId,
    enrolledAt: ENROLLED_AT,
    revokedAt: REVOKED_AT,
  });
  return { registerId, installationId: deviceId };
}

function confirmation(
  headers: Record<string, string>,
  installationId: string,
  overrides: Record<string, unknown> = {},
) {
  return app.inject({
    method: "POST",
    url: "/registers/fortnight-presentations/revoked-installation-confirmations",
    headers,
    payload: {
      point_of_sale_number: 8,
      fortnight_start: FORTNIGHT.start,
      installation_id: installationId,
      ...overrides,
    },
  });
}

const UNKNOWN_INSTALLATION = "0199b7a0-0000-7000-8000-0000000000ff";
const confirmations = () => db.select().from(revokedInstallationConfirmations);
const confirmationAudits = () =>
  db.select().from(auditLog).where(eq(auditLog.entity, "register_installation"));

describe("POST /registers/fortnight-presentations/revoked-installation-confirmations", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const { installationId } = await seedRevokedInstallation();

    const response = await confirmation({ origin: BACKOFFICE_ORIGIN }, installationId);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own, changing nothing", async () => {
    const { installationId } = await seedRevokedInstallation();
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await confirmation(
      { ...session.headers, origin: "https://attacker.example" },
      installationId,
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(await confirmations()).toEqual([]);
  });

  it("rejects a user holding only the permission to enroll registers with 403 forbidden", async () => {
    const { installationId } = await seedRevokedInstallation();
    const session = await sessionWith(["enroll_register_devices"]);

    const response = await confirmation(session.headers, installationId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    expect(await confirmations()).toEqual([]);
  });

  it("answers a body that does not match the wire shape with 400 validation_failed, before asking for a passkey", async () => {
    const session = await sessionWith(["change_fiscal_configuration"], false);

    const response = await confirmation(session.headers, "not-a-uuid");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("returns 401 authorization_required without a recent passkey, even for an installation that does not exist, changing nothing", async () => {
    const { installationId } = await seedRevokedInstallation();
    const session = await sessionWith(["change_fiscal_configuration"], false);

    const response = await confirmation(session.headers, installationId);
    const absent = await confirmation(session.headers, UNKNOWN_INSTALLATION);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authorization_required" });
    expect(absent.statusCode).toBe(401);
    expect(await confirmations()).toEqual([]);
  });

  it("answers 404 not_found for an installation that does not exist", async () => {
    await seedRevokedInstallation();
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await confirmation(session.headers, UNKNOWN_INSTALLATION);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
    expect(await confirmations()).toEqual([]);
  });

  it("answers 404 not_found for an installation of a register of another branch, changing nothing", async () => {
    const { installationId } = await seedRevokedInstallation();
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    await db.update(registers).set({ locationId: otherLocation?.id as string });
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await confirmation(session.headers, installationId);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
    expect(await confirmations()).toEqual([]);
  });

  it("answers 409 already_confirmed for an installation already confirmed for the fortnight", async () => {
    const { installationId } = await seedRevokedInstallation();
    const session = await sessionWith(["change_fiscal_configuration"]);
    await confirmation(session.headers, installationId);

    const response = await confirmation(session.headers, installationId);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "already_confirmed" });
    expect(await confirmations()).toHaveLength(1);
  });

  it("answers 409 already_presented for a fortnight whose report was already presented", async () => {
    const { installationId } = await seedRevokedInstallation();
    await new DrizzleFortnightReportStore(db, WITHOUT_CREDIT_NOTES).holdReport(
      { pointOfSaleNumber: 8, fortnight: FORTNIGHT },
      (report) => report.record({ state: "accepted", at: SESSION_NOON }),
    );
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await confirmation(session.headers, installationId);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "already_presented" });
    expect(await confirmations()).toEqual([]);
  });

  it("answers 409 not_revoked for an installation that was not revoked", async () => {
    const { registerId } = await seedRevokedInstallation();
    const active = await insertEnrolledInstallation(db, {
      now: SESSION_NOON,
      existingRegisterId: registerId,
      enrolledAt: ENROLLED_AT,
    });
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await confirmation(session.headers, active.deviceId);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "not_revoked" });
    expect(await confirmations()).toEqual([]);
  });

  it("answers 409 not_holding_back for a revoked installation whose stream already reaches past the close", async () => {
    const { installationId } = await seedRevokedInstallation();
    const syncedAt = new Date("2026-10-16T05:00:00.000Z");
    await insertInboxEvent(db, installationId, { occurredAt: syncedAt, appliedAt: syncedAt });
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await confirmation(session.headers, installationId);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "not_holding_back" });
    expect(await confirmations()).toEqual([]);
  });

  it("answers 409 holds_unapplied_events for a revoked installation whose received events are not all applied", async () => {
    const { installationId } = await seedRevokedInstallation();
    await insertInboxEvent(db, installationId, {
      occurredAt: new Date("2026-10-09T12:00:00.000Z"),
      appliedAt: null,
    });
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await confirmation(session.headers, installationId);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "holds_unapplied_events" });
    expect(await confirmations()).toEqual([]);
  });

  it("records the confirmation of a revoked installation, audited under the actor with its register and when it was revoked", async () => {
    const { registerId, installationId } = await seedRevokedInstallation();
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await confirmation(session.headers, installationId);

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    expect(await confirmations()).toEqual([
      {
        pointOfSaleNumber: 8,
        fortnightStart: FORTNIGHT.start,
        installationId,
        confirmedBy: session.userId,
        confirmedAt: SESSION_NOON,
      },
    ]);
    expect(await confirmationAudits()).toMatchObject([
      {
        entityId: installationId,
        actorId: session.userId,
        at: SESSION_NOON,
        newValue: {
          point_of_sale_number: 8,
          fortnight_start: FORTNIGHT.start,
          fortnight_end: FORTNIGHT.end,
          register_id: registerId,
          revoked_at: REVOKED_AT.toISOString(),
        },
      },
    ]);
  });
});
