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
import { DrizzleOfflineAuthorizationCodeStore } from "./drizzle-offline-authorization-code-store.js";
import { FORTNIGHT_REPORT_TASK_IDENTIFIER } from "./fortnight-report-task.js";
import {
  answersInTurn,
  type FakeWsfeServer,
  startFakeWsfeServer,
  UNREACHABLE_WSFE_ENDPOINT,
} from "./test-support/fake-wsfe-server.js";
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
  await sql`delete from fortnight_reports`;
  fakeWsfe.requests.length = 0;
});

function recoveryEnv() {
  return {
    databaseUrl: integrationDb.databaseUrl,
    emailSender: { transport: "log" as const },
    emailFrom: "Almacén de Prueba <acceso@mail.example.test>",
    emailReplyTo: "consultas@example.test",
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

async function syncEventOccurringAt(occurredAt: string) {
  const { deviceId } = await insertEnrolledInstallation(drizzle(sql), {
    now: NOW,
    existingRegisterId: registerId,
  });
  await insertInboxEvent(drizzle(sql), deviceId, { occurredAt: new Date(occurredAt) });
  return deviceId;
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

  it("records the fortnight as blocked and never declares it while no event reaches past its close", async () => {
    await sql`delete from inbox`;
    await sql`delete from register_installations`;
    await syncEventOccurringAt("2026-10-15T20:00:00.000Z");
    fakeWsfe.behave(answersInTurn("fe-caea-sin-movimiento-consultar-not-held.xml"));

    await reportOnDemand(1);

    expect(await sql`select state from fortnight_reports`).toEqual([{ state: "blocked" }]);
    expect(fakeWsfe.requests.join("")).not.toContain("FECAEASinMovimientoInformar");
  }, 90_000);
});
