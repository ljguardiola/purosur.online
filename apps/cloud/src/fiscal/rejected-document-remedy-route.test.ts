import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, locations, registers, rejectedDocumentRemedies } from "../platform/db/schema.js";
import {
  BACKOFFICE_ORIGIN,
  type BackofficeSession,
  openBackofficeSession,
  SESSION_NOON,
} from "../test-support/backoffice-session.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleFortnightReportStore } from "./drizzle-fortnight-report-store.js";
import { DrizzleOfflineAuthorizationCodeStore } from "./drizzle-offline-authorization-code-store.js";
import { registerRejectedDocumentRemedyRoute } from "./rejected-document-remedy-route.js";
import { insertOfflineFiscalDocument } from "./test-support/offline-fiscal-document-fixtures.js";
import { configureOfflinePointOfSale } from "./test-support/offline-point-of-sale-fixtures.js";
import { WITHOUT_CREDIT_NOTES } from "./test-support/rejected-document-remedy-fixtures.js";

const FORTNIGHT = { start: "2026-10-01", end: "2026-10-15" };
const ATTEMPTED_AT = new Date("2026-01-04T12:00:00.000Z");

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
  registerRejectedDocumentRemedyRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => SESSION_NOON,
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

async function seedRejectedDocument(rejectedNumber = 3) {
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
  for (const number of [2, 3, 4]) {
    await insertOfflineFiscalDocument(db, {
      registerId,
      pointOfSale: 8,
      fortnight: FORTNIGHT,
      number,
      issuedOn: `2026-10-0${number}`,
    });
  }
  await new DrizzleFortnightReportStore(db, WITHOUT_CREDIT_NOTES).holdReport(
    { pointOfSaleNumber: 8, fortnight: FORTNIGHT },
    (report) =>
      report.recordDocumentType({
        documentType: "factura_c",
        state: "refused",
        at: ATTEMPTED_AT,
        reportedThrough: rejectedNumber - 1,
        rejectedNumber,
        rejections: [{ code: 10016, message: "Fictional observation" }],
      }),
  );
}

function remedy(
  remedyBody: unknown,
  headers: Record<string, string>,
  overrides: Record<string, unknown> = {},
) {
  return app.inject({
    method: "POST",
    url: "/registers/fortnight-presentations/rejected-document-remedies",
    headers,
    payload: {
      point_of_sale_number: 8,
      fortnight_start: FORTNIGHT.start,
      document_type: "factura_c",
      number: 3,
      remedy: remedyBody,
      ...overrides,
    },
  });
}

const REPORT = { kind: "report" };
const remedyAudits = () =>
  db.select().from(auditLog).where(eq(auditLog.entity, "offline_fiscal_document"));
const remedies = () => db.select().from(rejectedDocumentRemedies);

describe("POST /registers/fortnight-presentations/rejected-document-remedies", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    await seedRejectedDocument();

    const response = await remedy(REPORT, { origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own, changing nothing", async () => {
    await seedRejectedDocument();
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await remedy(REPORT, {
      ...session.headers,
      origin: "https://attacker.example",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(await remedies()).toEqual([]);
  });

  it("rejects a user holding only the permission to enroll registers with 403 forbidden", async () => {
    await seedRejectedDocument();
    const session = await sessionWith(["enroll_register_devices"]);

    const response = await remedy(REPORT, session.headers);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    expect(await remedies()).toEqual([]);
  });

  it("answers a body that does not match the wire shape with 400 validation_failed, before asking for a passkey", async () => {
    const session = await sessionWith(["change_fiscal_configuration"], false);

    const response = await remedy({ kind: "discard" }, session.headers);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("returns 401 authorization_required without a recent passkey, even for a document that was not rejected, changing nothing", async () => {
    await seedRejectedDocument();
    const session = await sessionWith(["change_fiscal_configuration"], false);

    const response = await remedy(REPORT, session.headers);
    const absent = await remedy(REPORT, session.headers, { number: 99 });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authorization_required" });
    expect(absent.statusCode).toBe(401);
    expect(await remedies()).toEqual([]);
  });

  it("answers 409 not_rejected for a document the tax authority did not reject", async () => {
    await seedRejectedDocument();
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await remedy(REPORT, session.headers, { number: 4 });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "not_rejected" });
    expect(await remedies()).toEqual([]);
  });

  it("answers 409 not_rejected for a rejected document of another branch, changing nothing", async () => {
    await seedRejectedDocument();
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    await db.update(registers).set({ locationId: otherLocation?.id as string });
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await remedy(REPORT, session.headers);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "not_rejected" });
    expect(await remedies()).toEqual([]);
  });

  it("answers 409 already_remedied for a document whose remedy waits to be resent", async () => {
    await seedRejectedDocument();
    const session = await sessionWith(["change_fiscal_configuration"]);
    await remedy(REPORT, session.headers);

    const response = await remedy(REPORT, session.headers);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "already_remedied" });
    expect(await remedies()).toHaveLength(1);
  });

  it("answers 404 document_not_found for a correction of a rejected number no document carries", async () => {
    await seedRejectedDocument(9);
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await remedy(
      { kind: "printed", correction: { total: 500 } },
      session.headers,
      {
        number: 9,
      },
    );

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "document_not_found" });
    expect(await remedies()).toEqual([]);
  });

  it("answers 422 correction_refused naming the refusal of the domain, changing nothing", async () => {
    await seedRejectedDocument();
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await remedy(
      { kind: "printed", correction: { issued_on: "2026-12-31" } },
      session.headers,
    );

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      code: "correction_refused",
      refusal: "date_outside_fortnight",
    });
    expect(await remedies()).toEqual([]);
    expect(await remedyAudits()).toEqual([]);
  });

  it("records the remedy that reports the document again, audited under the actor", async () => {
    await seedRejectedDocument();
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await remedy(REPORT, session.headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ recorded_at: SESSION_NOON.toISOString(), changes: [] });
    expect(await remedies()).toMatchObject([
      { number: 3, kind: "report", recordedAt: SESSION_NOON },
    ]);
    expect(await remedyAudits()).toMatchObject([
      { actorId: session.userId, at: SESSION_NOON, newValue: { remedy: "report", number: 3 } },
    ]);
  });

  it("records a correction and answers the fields it changed with their values before and after, audited under the actor", async () => {
    await seedRejectedDocument();
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await remedy(
      { kind: "printed", correction: { issued_on: "2026-10-02", total: 12_500 } },
      session.headers,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      recorded_at: SESSION_NOON.toISOString(),
      changes: [
        { field: "issued_on", before: "2026-10-03", after: "2026-10-02" },
        { field: "total", before: 10_000, after: 12_500 },
      ],
    });
    expect(await remedies()).toMatchObject([
      { kind: "printed", correction: { issuedOn: "2026-10-02", total: 12_500 } },
    ]);
    const entries = await db.select().from(auditLog).where(eq(auditLog.actorId, session.userId));
    expect(entries).toMatchObject([
      {
        entity: "offline_fiscal_document",
        previousValue: { issued_on: "2026-10-03", total: 10_000 },
        newValue: { issued_on: "2026-10-02", total: 12_500 },
      },
    ]);
  });
});
