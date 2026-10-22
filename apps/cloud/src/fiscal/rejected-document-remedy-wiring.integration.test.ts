import { FICTIONAL_CERTIFICATE_CUIT } from "@purosur/domain/fiscal/test-support";
import { remedyRejectedDocument } from "@purosur/domain/fiscal/use-cases";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessEmailSender } from "../credentials/recovery-email-sender.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { setUpRecovery } from "../server.js";
import { insertInboxEvent } from "../sync/test-support/inbox-events.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import {
  FICTIONAL_RECOVERY_REPLY_TO,
  FICTIONAL_RECOVERY_SENDER,
} from "../test-support/recovery-email.js";
import { DrizzleOfflineAuthorizationCodeStore } from "./drizzle-offline-authorization-code-store.js";
import { DrizzleRejectedDocumentRemedyStore } from "./drizzle-rejected-document-remedy-store.js";
import { FORTNIGHT_REPORT_TASK_IDENTIFIER } from "./fortnight-report-task.js";
import {
  answersInTurn,
  type FakeWsfeServer,
  startFakeWsfeServer,
  UNREACHABLE_WSFE_ENDPOINT,
} from "./test-support/fake-wsfe-server.js";
import { insertOfflineFiscalDocument } from "./test-support/offline-fiscal-document-fixtures.js";
import { seedOfflinePointOfSale } from "./test-support/offline-point-of-sale-fixtures.js";

const UNUSED_EMAIL_SENDER: AccessEmailSender = {
  async sendRecoveryLink() {},
  async sendFirstPinCode() {},
};

const FINGERPRINT = "AA:BB:CC";
const FIRST_RUN = new Date("2026-10-16T15:00:00.000Z");
const REMEDIED_AT = new Date("2026-10-16T16:00:00.000Z");
const SECOND_RUN = new Date("2026-10-16T17:00:00.000Z");
const OCTOBER_FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let fakeWsfe: FakeWsfeServer;
let registerId: string;
let currentTime: Date;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("rejected_document_remedy_wiring");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  fakeWsfe = await startFakeWsfeServer();
  await sql`
    insert into arca_wsaa_tokens (service, certificate_fingerprint, token, sign, issued_at, expires_at)
    values ('wsfe', ${FINGERPRINT}, 'FICTIONAL-TOKEN-0001', 'FICTIONAL-SIGN-0001',
            ${new Date("2026-10-16T12:00:00.000Z")}, ${new Date("2026-10-17T00:00:00.000Z")})
  `;
  registerId = await seedOfflinePointOfSale(drizzle(sql));
  const admin = postgres(integrationDb.adminDatabaseUrl, { max: 1 });
  try {
    await admin`update point_of_sale_claims set claimed_at = ${"2026-09-20T12:00:00.000Z"}::timestamptz`;
  } finally {
    await admin.end({ timeout: 1 });
  }
  await new DrizzleOfflineAuthorizationCodeStore(drizzle(sql)).holdAcquisition(
    OCTOBER_FIRST_HALF,
    (acquisition) =>
      acquisition.keep({
        code: {
          code: "36123456789012",
          fortnight: OCTOBER_FIRST_HALF,
          reportDeadline: "2026-10-20",
        },
        obtainedAt: new Date("2026-09-28T12:00:00.000Z"),
        obtainedThrough: "requested",
      }),
  );
}, 60_000);

afterAll(async () => {
  await fakeWsfe.close();
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

beforeEach(async () => {
  const admin = postgres(integrationDb.adminDatabaseUrl, { max: 1 });
  try {
    await admin`delete from rejected_document_remedies`;
    await admin`delete from credit_notes`;
    await admin`delete from audit_log where entity = 'offline_fiscal_document'`;
    await admin`delete from fortnight_document_reports`;
    await admin`delete from fortnight_reports`;
    await admin`delete from offline_fiscal_documents`;
    await admin`delete from inbox`;
    await admin`delete from register_installations`;
  } finally {
    await admin.end({ timeout: 1 });
  }
  fakeWsfe.requests.length = 0;
  currentTime = FIRST_RUN;
  const { deviceId } = await insertEnrolledInstallation(drizzle(sql), {
    now: FIRST_RUN,
    existingRegisterId: registerId,
  });
  await insertInboxEvent(drizzle(sql), deviceId, {
    occurredAt: new Date("2026-10-16T10:00:00.000Z"),
    appliedAt: new Date("2026-10-16T10:00:00.000Z"),
  });
  for (const number of [2, 3, 4]) {
    await insertOfflineFiscalDocument(drizzle(sql), {
      registerId,
      pointOfSale: 8,
      fortnight: OCTOBER_FIRST_HALF,
      number,
      issuedOn: `2026-10-0${number}`,
    });
  }
});

async function runReportTask() {
  const recovery = await setUpRecovery(
    {
      databaseUrl: integrationDb.databaseUrl,
      emailSender: { transport: "log" as const },
      emailFrom: FICTIONAL_RECOVERY_SENDER,
      emailReplyTo: FICTIONAL_RECOVERY_REPLY_TO,
      backofficeOrigin: "https://backoffice.example.test",
      arcaCertificate: { environment: "production", notAfter: new Date("2126-09-01T19:42:17Z") },
      arcaVitality: { endpoint: UNREACHABLE_WSFE_ENDPOINT },
      arcaInvoicing: {
        endpoint: fakeWsfe.endpoint,
        cuit: FICTIONAL_CERTIFICATE_CUIT,
        certificateFingerprint: FINGERPRINT,
      },
    },
    () => currentTime,
    { emailSender: UNUSED_EMAIL_SENDER, schedules: false },
  );
  try {
    await recovery.workerUtils.addJob(FORTNIGHT_REPORT_TASK_IDENTIFIER, {});
    await vi.waitFor(
      async () => {
        expect(
          await sql`select 1 from graphile_worker.jobs where task_identifier = ${FORTNIGHT_REPORT_TASK_IDENTIFIER}`,
        ).toHaveLength(0);
      },
      { timeout: 20_000, interval: 100 },
    );
  } finally {
    await recovery.close();
  }
}

async function recordPrintedCorrection() {
  const [actor] = await sql<{ id: string }[]>`select id from users limit 1`;
  const [location] = await sql<{ id: string }[]>`select id from locations limit 1`;
  const outcome = await remedyRejectedDocument(
    {
      store: new DrizzleRejectedDocumentRemedyStore(drizzle(sql)),
      clock: { now: () => REMEDIED_AT },
    },
    {
      locationId: location?.id as string,
      pointOfSaleNumber: 8,
      fortnightStart: OCTOBER_FIRST_HALF.start,
      documentType: "factura_c",
      number: 3,
      remedy: { kind: "printed", correction: { issuedOn: "2026-10-02", total: 12_500 } },
      actorId: actor?.id as string,
    },
  );
  expect(outcome.kind).toBe("remedied");
}

const registerReports = () => fakeWsfe.requests.filter((r) => r.includes("FECAEARegInformativo"));

describe("a rejected document of a fortnight's presentation on a real Postgres", () => {
  it("is held for its remedy, resent corrected under the same number once remedied, and credited on the register's real-time point of sale", async () => {
    fakeWsfe.behave(
      answersInTurn(
        "fe-caea-sin-movimiento-consultar-not-held.xml",
        "fe-comp-ultimo-autorizado.xml",
        "fe-comp-tot-x-request.xml",
        "fe-caea-reg-informativo-synthesized-partly-rejected-second.xml",
        "fe-caea-sin-movimiento-consultar-not-held.xml",
        "fe-comp-ultimo-autorizado-synthesized-2.xml",
        "fe-comp-tot-x-request.xml",
        "fe-caea-reg-informativo-accepted.xml",
        "fe-comp-ultimo-autorizado-synthesized-4.xml",
      ),
    );

    await runReportTask();
    expect(registerReports()).toHaveLength(1);
    expect(
      await sql`select state, reported_through, rejected_number from fortnight_document_reports`,
    ).toEqual([{ state: "refused", reported_through: 2, rejected_number: 3 }]);

    const requestsBeforeAwaiting = fakeWsfe.requests.length;
    currentTime = new Date("2026-10-16T15:30:00.000Z");
    await runReportTask();
    expect(fakeWsfe.requests).toHaveLength(requestsBeforeAwaiting);

    await recordPrintedCorrection();
    currentTime = SECOND_RUN;
    await runReportTask();

    const [resend] = registerReports().slice(1);
    expect(resend?.match(/<CbteDesde>(\d+)<\/CbteDesde>/g)).toEqual([
      "<CbteDesde>3</CbteDesde>",
      "<CbteDesde>4</CbteDesde>",
    ]);
    expect(resend).toContain("<CbteFch>20261002</CbteFch>");
    expect(resend).toContain("<ImpTotal>125.00</ImpTotal>");
    expect(await sql`select state, reported_through from fortnight_document_reports`).toEqual([
      { state: "accepted", reported_through: 4 },
    ]);
    expect(
      await sql`select reason, point_of_sale, associated_voucher_type, associated_point_of_sale, associated_number, total::int as total from credit_notes`,
    ).toEqual([
      {
        reason: "rejected_document",
        point_of_sale: 7,
        associated_voucher_type: 11,
        associated_point_of_sale: 8,
        associated_number: 3,
        total: 12_500,
      },
    ]);
  }, 120_000);

  it("issues no credit note while ARCA rejects the corrected number again, and waits for another remedy", async () => {
    fakeWsfe.behave(
      answersInTurn(
        "fe-caea-sin-movimiento-consultar-not-held.xml",
        "fe-comp-ultimo-autorizado.xml",
        "fe-comp-tot-x-request.xml",
        "fe-caea-reg-informativo-synthesized-partly-rejected-second.xml",
        "fe-caea-sin-movimiento-consultar-not-held.xml",
        "fe-comp-ultimo-autorizado-synthesized-2.xml",
        "fe-comp-tot-x-request.xml",
        "fe-caea-reg-informativo-synthesized-corrected-rejected-again.xml",
      ),
    );
    await runReportTask();
    await recordPrintedCorrection();
    currentTime = SECOND_RUN;

    await runReportTask();

    expect(registerReports()).toHaveLength(2);
    expect(await sql`select count(*)::int as count from credit_notes`).toEqual([{ count: 0 }]);
    expect(await sql`select state, rejected_number from fortnight_document_reports`).toEqual([
      { state: "refused", rejected_number: 3 },
    ]);
    const requestsBeforeAwaiting = fakeWsfe.requests.length;
    currentTime = new Date("2026-10-16T18:00:00.000Z");
    await runReportTask();
    expect(fakeWsfe.requests).toHaveLength(requestsBeforeAwaiting);
  }, 120_000);
});
