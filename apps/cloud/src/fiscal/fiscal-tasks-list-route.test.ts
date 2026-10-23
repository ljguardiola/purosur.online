import { externalBillingObservation } from "@purosur/domain";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openAlert } from "../alerts/open-alert.js";
import { alerts, creditNotes, fiscalTasks, locations, registers } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import {
  BACKOFFICE_ORIGIN,
  openBackofficeSession,
  SESSION_NOON,
} from "../test-support/backoffice-session.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerFiscalTasksListRoute } from "./fiscal-tasks-list-route.js";
import {
  insertDeferredSaleRow,
  insertDeferredSaleTaskRow,
} from "./test-support/deferred-sale-fixtures.js";

const ONE_HOUR_AGO = new Date("2026-01-05T11:00:00.000Z");
const TWO_HOURS_AGO = new Date("2026-01-05T10:00:00.000Z");
const THREE_HOURS_AGO = new Date("2026-01-05T09:00:00.000Z");

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
  registerFiscalTasksListRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => SESSION_NOON,
  });
});

afterEach(async () => {
  await app.close();
});

function listTasks(headers: Record<string, string>) {
  return app.inject({ method: "GET", url: "/fiscal/tasks", headers });
}

async function aFiscalInformationSession() {
  return openBackofficeSession(db, {
    now: SESSION_NOON,
    locationId: await seededLocationId(db),
    permissionKeys: ["view_fiscal_documents"],
  });
}

async function insertExternalInvoicingTask(
  registerId: string,
  { number, createdAt }: { number: number; createdAt: Date },
) {
  const id = crypto.randomUUID();
  await db.insert(fiscalTasks).values({
    id,
    kind: "external_invoicing",
    registerId,
    pointOfSale: 7,
    documentType: "factura_c",
    number,
    reason: { issuedOn: "2026-01-02", total: 12_500, authorizationCode: "75123456789012" },
    state: "open",
    createdAt,
  });
  return id;
}

async function insertRejectedCreditNoteTask(registerId: string, createdAt: Date) {
  const creditNoteId = crypto.randomUUID();
  await db.insert(creditNotes).values({
    id: creditNoteId,
    registerId,
    saleId: crypto.randomUUID(),
    pointOfSale: 7,
    associatedVoucherType: 11,
    associatedPointOfSale: 7,
    reason: "orphan",
    associatedNumber: 3,
    keptVoucherType: 11,
    keptPointOfSale: 31,
    keptNumber: 3,
    total: 12_500,
    receiverTaxStatusCode: 5,
    createdAt,
  });
  const id = crypto.randomUUID();
  await db.insert(fiscalTasks).values({
    id,
    kind: "credit_note_rejected",
    registerId,
    pointOfSale: 7,
    documentType: "credit_note_c",
    number: 4,
    creditNoteId,
    reason: { rejections: [{ code: 10_016, message: "Comprobante asociado inexistente" }] },
    state: "open",
    createdAt,
  });
  return { id, creditNoteId };
}

describe("GET /fiscal/tasks", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await listTasks({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects a user without access to fiscal information with 403 forbidden", async () => {
    const session = await openBackofficeSession(db, {
      now: SESSION_NOON,
      locationId: await seededLocationId(db),
      permissionKeys: ["enroll_register_devices"],
    });

    const response = await listTasks(session.headers);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("answers an empty list when no task is open", async () => {
    const session = await aFiscalInformationSession();

    const response = await listTasks(session.headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ tasks: [] });
  });

  it("lists an invoicing outside the register with its voucher and the open alert raised for it", async () => {
    const installation = await insertEnrolledInstallation(db, {
      now: SESSION_NOON,
      registerName: "Caja 1",
    });
    const session = await aFiscalInformationSession();
    const id = await insertExternalInvoicingTask(installation.registerId, {
      number: 9,
      createdAt: ONE_HOUR_AGO,
    });
    const observation = externalBillingObservation({
      pointOfSale: 7,
      documentType: "factura_c",
      number: 9,
    });
    if (!observation.holds) {
      throw new Error("test setup: an invoicing outside the register always holds an alert");
    }
    await openAlert(db, observation.alert, { now: () => ONE_HOUR_AGO });
    const [alert] = await db.select().from(alerts).where(eq(alerts.kind, "external_billing"));

    const response = await listTasks(session.headers);

    expect(response.json()).toEqual({
      tasks: [
        {
          id,
          kind: "external_invoicing",
          register_id: installation.registerId,
          register_name: "Caja 1",
          created_at: "2026-01-05T11:00:00.000Z",
          open_for_seconds: 3600,
          alert: { level: alert?.level, escalated_at: null },
          point_of_sale: 7,
          document_type: "factura_c",
          number: 9,
          voucher: { issued_on: "2026-01-02", total: 12_500, authorization_code: "75123456789012" },
        },
      ],
    });
  });

  it("tells when the alert of an invoicing outside the register escalated", async () => {
    const installation = await insertEnrolledInstallation(db, { now: SESSION_NOON });
    const session = await aFiscalInformationSession();
    await insertExternalInvoicingTask(installation.registerId, {
      number: 9,
      createdAt: ONE_HOUR_AGO,
    });
    const observation = externalBillingObservation({
      pointOfSale: 7,
      documentType: "factura_c",
      number: 9,
    });
    if (!observation.holds) {
      throw new Error("test setup: an invoicing outside the register always holds an alert");
    }
    await openAlert(db, observation.alert, { now: () => ONE_HOUR_AGO });
    await db
      .update(alerts)
      .set({ level: "critical", escalatedAt: TWO_HOURS_AGO })
      .where(eq(alerts.kind, "external_billing"));

    const response = await listTasks(session.headers);

    expect(response.json().tasks[0].alert).toEqual({
      level: "critical",
      escalated_at: "2026-01-05T10:00:00.000Z",
    });
  });

  it("leaves the alert of a task out once the alert is resolved", async () => {
    const installation = await insertEnrolledInstallation(db, { now: SESSION_NOON });
    const session = await aFiscalInformationSession();
    await insertExternalInvoicingTask(installation.registerId, {
      number: 9,
      createdAt: ONE_HOUR_AGO,
    });
    const observation = externalBillingObservation({
      pointOfSale: 7,
      documentType: "factura_c",
      number: 9,
    });
    if (!observation.holds) {
      throw new Error("test setup: an invoicing outside the register always holds an alert");
    }
    await openAlert(db, observation.alert, { now: () => ONE_HOUR_AGO });
    await db.update(alerts).set({ resolvedAt: SESSION_NOON });

    const response = await listTasks(session.headers);

    expect(response.json().tasks[0].alert).toBeNull();
  });

  it("lists a rejected credit note with the reasons the tax authority gave and no alert", async () => {
    const installation = await insertEnrolledInstallation(db, { now: SESSION_NOON });
    const session = await aFiscalInformationSession();
    const { id, creditNoteId } = await insertRejectedCreditNoteTask(
      installation.registerId,
      ONE_HOUR_AGO,
    );

    const response = await listTasks(session.headers);

    expect(response.json()).toEqual({
      tasks: [
        {
          id,
          kind: "credit_note_rejected",
          register_id: installation.registerId,
          register_name: "Caja 1",
          created_at: "2026-01-05T11:00:00.000Z",
          open_for_seconds: 3600,
          alert: null,
          point_of_sale: 7,
          number: 4,
          credit_note_id: creditNoteId,
          rejections: [{ code: 10_016, message: "Comprobante asociado inexistente" }],
        },
      ],
    });
  });

  it("lists the regularization task of an expired deferred sale with its date, total and short code", async () => {
    const installation = await insertEnrolledInstallation(db, { now: SESSION_NOON });
    const session = await aFiscalInformationSession();
    const sale = await insertDeferredSaleRow(db, {
      ...installation,
      state: "expired",
      expiredAt: ONE_HOUR_AGO,
    });
    const id = await insertDeferredSaleTaskRow(db, {
      registerId: installation.registerId,
      deferredSaleId: sale.id,
      createdAt: ONE_HOUR_AGO,
      reason: {
        saleOccurredAt: sale.occurredAt.toISOString(),
        total: 4800,
        shortCode: "7KQ4M2P9",
      },
    });

    const response = await listTasks(session.headers);

    expect(response.json()).toEqual({
      tasks: [
        {
          id,
          kind: "deferred_sale_expired",
          register_id: installation.registerId,
          register_name: "Caja 1",
          created_at: "2026-01-05T11:00:00.000Z",
          open_for_seconds: 3600,
          alert: null,
          sale_occurred_at: sale.occurredAt.toISOString(),
          total: 4800,
          short_code: "7KQ4M2P9",
        },
      ],
    });
  });

  it("lists the open tasks oldest first, leaving out the closed ones and those of another branch", async () => {
    const installation = await insertEnrolledInstallation(db, { now: SESSION_NOON });
    const session = await aFiscalInformationSession();
    const newer = await insertExternalInvoicingTask(installation.registerId, {
      number: 1,
      createdAt: ONE_HOUR_AGO,
    });
    const older = await insertExternalInvoicingTask(installation.registerId, {
      number: 2,
      createdAt: THREE_HOURS_AGO,
    });
    const closed = await insertExternalInvoicingTask(installation.registerId, {
      number: 3,
      createdAt: TWO_HOURS_AGO,
    });
    await db
      .update(fiscalTasks)
      .set({ state: "closed", closedAt: ONE_HOUR_AGO })
      .where(eq(fiscalTasks.id, closed));
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) {
      throw new Error("test setup: seeding the other location returned no row");
    }
    const [otherRegister] = await db
      .insert(registers)
      .values({ locationId: otherLocation.id, name: "Caja 9" })
      .returning({ id: registers.id });
    if (!otherRegister) {
      throw new Error("test setup: seeding the other branch's register returned no row");
    }
    await insertExternalInvoicingTask(otherRegister.id, {
      number: 4,
      createdAt: THREE_HOURS_AGO,
    });

    const response = await listTasks(session.headers);

    expect(response.json().tasks.map((task: { id: string }) => task.id)).toEqual([older, newer]);
  });
});
