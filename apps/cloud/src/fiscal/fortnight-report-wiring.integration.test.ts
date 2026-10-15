import { FICTIONAL_CERTIFICATE_CUIT } from "@purosur/domain/fiscal/test-support";
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
const NOW = new Date("2026-10-16T15:00:00.000Z");
const OCTOBER_FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let fakeWsfe: FakeWsfeServer;
let registerId: string;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("fortnight_report_wiring");
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
    await admin`delete from fortnight_document_reports`;
    await admin`delete from fortnight_reports`;
    await admin`delete from offline_fiscal_documents`;
  } finally {
    await admin.end({ timeout: 1 });
  }
  fakeWsfe.requests.length = 0;
});

function recoveryEnv() {
  return {
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
  };
}

async function reportOnDemand(expectedRequests: number) {
  const recovery = await setUpRecovery(recoveryEnv(), () => NOW, {
    emailSender: UNUSED_EMAIL_SENDER,
    schedules: false,
  });
  try {
    await recovery.workerUtils.addJob(FORTNIGHT_REPORT_TASK_IDENTIFIER, {});
    await vi.waitFor(
      async () => {
        expect(await sql`select 1 from fortnight_reports`).toHaveLength(1);
        expect(fakeWsfe.requests).toHaveLength(expectedRequests);
      },
      { timeout: 20_000, interval: 100 },
    );
  } finally {
    await recovery.close();
  }
}

async function reportOnDemandUntilDone() {
  const recovery = await setUpRecovery(recoveryEnv(), () => NOW, {
    emailSender: UNUSED_EMAIL_SENDER,
    schedules: false,
  });
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

async function syncEventOccurringAt(occurredAt: string) {
  const { deviceId } = await insertEnrolledInstallation(drizzle(sql), {
    now: NOW,
    existingRegisterId: registerId,
  });
  await insertInboxEvent(drizzle(sql), deviceId, {
    occurredAt: new Date(occurredAt),
    appliedAt: new Date(occurredAt),
  });
  return deviceId;
}

async function receiveOfflineDocumentEvent(deviceId: string, quarantinedAt: Date | null) {
  await insertInboxEvent(drizzle(sql), deviceId, {
    aggregateType: "OfflineFiscalDocument",
    eventType: "offline_fiscal_document_issued",
    schemaVersion: 1,
    occurredAt: new Date("2026-10-10T15:00:00.000Z"),
    receivedAt: new Date("2026-10-16T12:00:00.000Z"),
    quarantinedAt,
  });
}

describe("the fortnight report the server sets up on a real Postgres", () => {
  it("declares the closed fortnight to ARCA once the register's events reach past its close, and records it as accepted", async () => {
    await syncEventOccurringAt("2026-10-16T10:00:00.000Z");
    fakeWsfe.behave(
      answersInTurn(
        "fe-caea-sin-movimiento-consultar-not-held.xml",
        "fe-caea-sin-movimiento-informar-accepted.xml",
      ),
    );

    await reportOnDemand(2);

    expect(
      await sql`select point_of_sale_number as pos, fortnight_start::text as "start", state from fortnight_reports`,
    ).toEqual([{ pos: 8, start: "2026-10-01", state: "accepted" }]);
    expect(fakeWsfe.requests[0]).toContain("FECAEASinMovimientoConsultar");
    expect(fakeWsfe.requests[1]).toContain("FECAEASinMovimientoInformar");
    expect(fakeWsfe.requests[1]).toContain("FICTIONAL-TOKEN-0001");
  }, 90_000);

  it("declares the closed fortnight when no event reaches past its close but the register was caught up after it", async () => {
    await sql`delete from inbox`;
    await sql`delete from register_installations`;
    const deviceId = await syncEventOccurringAt("2026-10-15T20:00:00.000Z");
    await sql`insert into device_state (device_id, caught_up_at)
              values (${deviceId}, ${"2026-10-16T09:00:00.000Z"}::timestamptz)`;
    fakeWsfe.behave(
      answersInTurn(
        "fe-caea-sin-movimiento-consultar-not-held.xml",
        "fe-caea-sin-movimiento-informar-accepted.xml",
      ),
    );

    await reportOnDemand(2);

    expect(await sql`select state from fortnight_reports`).toEqual([{ state: "accepted" }]);
  }, 90_000);

  it("records the fortnight as blocked and never declares it while no event reaches past its close", async () => {
    await sql`delete from inbox`;
    await sql`delete from register_installations`;
    await syncEventOccurringAt("2026-10-15T20:00:00.000Z");
    fakeWsfe.behave(answersInTurn("fe-caea-sin-movimiento-consultar-not-held.xml"));

    await reportOnDemand(1);

    expect(await sql`select state from fortnight_reports`).toEqual([{ state: "blocked" }]);
    expect(fakeWsfe.requests.join("")).not.toContain("FECAEASinMovimientoInformar");
  }, 90_000);

  it.each([
    ["received but not applied yet", null],
    ["quarantined", new Date("2026-10-16T12:05:00.000Z")],
  ])(
    "never declares a fortnight without movement while a document event of the register is %s, even when its stream reaches past the close",
    async (_standing, quarantinedAt) => {
      await sql`delete from inbox`;
      await sql`delete from register_installations`;
      const deviceId = await syncEventOccurringAt("2026-10-16T10:00:00.000Z");
      await sql`insert into device_state (device_id, caught_up_at)
                values (${deviceId}, ${"2026-10-16T13:00:00.000Z"}::timestamptz)`;
      await receiveOfflineDocumentEvent(deviceId, quarantinedAt);
      fakeWsfe.behave(answersInTurn("fe-caea-sin-movimiento-consultar-not-held.xml"));

      await reportOnDemandUntilDone();

      expect(await sql`select state from fortnight_reports`).toEqual([{ state: "blocked" }]);
      expect(fakeWsfe.requests.join("")).not.toContain("FECAEASinMovimientoInformar");
    },
    90_000,
  );

  it("reports the documents the point of sale issued under the code, in the batch ARCA sizes, instead of declaring no movement, and records the fortnight as accepted with movement", async () => {
    await sql`delete from inbox`;
    await sql`delete from register_installations`;
    await syncEventOccurringAt("2026-10-16T10:00:00.000Z");
    for (const number of [2, 3]) {
      await insertOfflineFiscalDocument(drizzle(sql), {
        registerId,
        pointOfSale: 8,
        fortnight: OCTOBER_FIRST_HALF,
        number,
      });
    }
    fakeWsfe.behave(
      answersInTurn(
        "fe-caea-sin-movimiento-consultar-not-held.xml",
        "fe-comp-ultimo-autorizado.xml",
        "fe-comp-tot-x-request.xml",
        "fe-caea-reg-informativo-accepted.xml",
        "fe-comp-ultimo-autorizado-after-batch.xml",
      ),
    );

    await reportOnDemand(5);

    expect(fakeWsfe.requests.join("")).not.toContain("FECAEASinMovimientoInformar");
    const [report] = fakeWsfe.requests.filter((request) =>
      request.includes("FECAEARegInformativo"),
    );
    expect(report?.match(/<CbteDesde>/g)).toHaveLength(2);
    expect(await sql`select state, movement from fortnight_reports`).toEqual([
      { state: "accepted", movement: "documents" },
    ]);
    expect(
      await sql`select point_of_sale_number as pos, document_type, state, reported_through from fortnight_document_reports`,
    ).toEqual([{ pos: 8, document_type: "factura_c", state: "accepted", reported_through: 3 }]);
  }, 90_000);

  it("marks a fortnight declared without movement as needing regularization when documents sync in afterwards, and sends nothing to ARCA", async () => {
    await sql`delete from inbox`;
    await sql`delete from register_installations`;
    await sql`insert into fortnight_reports
                (point_of_sale_number, fortnight_start, fortnight_end, state, movement, recorded_at)
              values (8, '2026-10-01', '2026-10-15', 'accepted', 'none', ${NOW.toISOString()}::timestamptz)`;
    await insertOfflineFiscalDocument(drizzle(sql), {
      registerId,
      pointOfSale: 8,
      fortnight: OCTOBER_FIRST_HALF,
      number: 1,
    });

    const recovery = await setUpRecovery(recoveryEnv(), () => NOW, {
      emailSender: UNUSED_EMAIL_SENDER,
      schedules: false,
    });
    try {
      await recovery.workerUtils.addJob(FORTNIGHT_REPORT_TASK_IDENTIFIER, {});
      await vi.waitFor(
        async () => {
          expect(await sql`select state from fortnight_reports`).toEqual([
            { state: "needs_regularization" },
          ]);
        },
        { timeout: 20_000, interval: 100 },
      );
    } finally {
      await recovery.close();
    }

    expect(fakeWsfe.requests).toEqual([]);
  }, 90_000);
});
