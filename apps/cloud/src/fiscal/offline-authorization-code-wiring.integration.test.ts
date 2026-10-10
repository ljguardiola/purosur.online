import { FICTIONAL_CERTIFICATE_CUIT } from "@purosur/domain/fiscal/test-support";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AccessEmailSender } from "../credentials/recovery-email-sender.js";
import { setUpRecovery } from "../server.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { OFFLINE_AUTHORIZATION_CODE_TASK_IDENTIFIER } from "./offline-authorization-code-task.js";
import {
  answers,
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
const NOW = new Date("2026-10-03T15:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let fakeWsfe: FakeWsfeServer;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("offline_authorization_code_wiring");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
  fakeWsfe = await startFakeWsfeServer();
  await sql`
    insert into arca_wsaa_tokens (service, certificate_fingerprint, token, sign, issued_at, expires_at)
    values ('wsfe', ${FINGERPRINT}, 'FICTIONAL-TOKEN-0001', 'FICTIONAL-SIGN-0001',
            ${new Date("2026-10-03T12:00:00.000Z")}, ${new Date("2026-10-04T00:00:00.000Z")})
  `;
  await seedOfflinePointOfSale(drizzle(sql));
}, 60_000);

afterAll(async () => {
  await fakeWsfe.close();
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function recoveryEnv() {
  return {
    databaseUrl: integrationDb.databaseUrl,
    emailSender: { transport: "log" as const },
    emailFrom: "Puro Sur <acceso@mail.staging.purosur.online>",
    emailReplyTo: "purosur.comarca@gmail.com",
    backofficeOrigin: "https://staging.purosur.online",
    arcaCertificate: { environment: "production", notAfter: new Date("2126-09-01T19:42:17Z") },
    arcaVitality: { endpoint: UNREACHABLE_WSFE_ENDPOINT },
    arcaInvoicing: {
      endpoint: fakeWsfe.endpoint,
      cuit: FICTIONAL_CERTIFICATE_CUIT,
      certificateFingerprint: FINGERPRINT,
    },
  };
}

async function acquireOnDemand() {
  const recovery = await setUpRecovery(recoveryEnv(), () => NOW, {
    emailSender: UNUSED_EMAIL_SENDER,
  });
  try {
    await recovery.workerUtils.addJob(OFFLINE_AUTHORIZATION_CODE_TASK_IDENTIFIER, {});
    await vi.waitFor(
      async () => {
        expect(await sql`select 1 from caea_codes`).toHaveLength(1);
      },
      { timeout: 20_000, interval: 100 },
    );
  } finally {
    await recovery.close();
  }
}

describe("the offline authorization code acquisition the server sets up on a real Postgres", () => {
  it("requests the current fortnight's code from ARCA and keeps it as requested", async () => {
    fakeWsfe.behave(answers("fe-caea-solicitar-granted.xml"));

    await acquireOnDemand();

    expect(
      await sql`select fortnight_start::text as "start", code, obtained_through as "through" from caea_codes`,
    ).toEqual([{ start: "2026-10-01", code: "36123456789012", through: "requested" }]);
    expect(fakeWsfe.requests[0]).toContain("FICTIONAL-TOKEN-0001");
    expect(fakeWsfe.requests[0]).toContain("FECAEASolicitar");
  }, 90_000);

  it("recovers a code ARCA already granted, keeping it as recovered", async () => {
    await sql`delete from caea_codes`;
    fakeWsfe.behave(
      answersInTurn("fe-caea-solicitar-already-granted.xml", "fe-caea-consultar-granted.xml"),
    );

    await acquireOnDemand();

    expect(await sql`select obtained_through as "through" from caea_codes`).toEqual([
      { through: "recovered" },
    ]);
  }, 90_000);
});
