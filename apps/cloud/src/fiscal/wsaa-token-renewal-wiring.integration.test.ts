import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AccessEmailSender } from "../access/recovery-email-sender.js";
import { setUpRecovery } from "../server.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import {
  type ArcaTestCredentials,
  generateArcaTestCredentials,
} from "./test-support/arca-test-credentials.js";
import { type FakeWsaaServer, startFakeWsaaServer } from "./test-support/fake-wsaa-server.js";
import { UNREACHABLE_WSFE_ENDPOINT } from "./test-support/fake-wsfe-server.js";
import { WSAA_TOKEN_RENEWAL_TASK_IDENTIFIER } from "./wsaa-token-renewal-task.js";

const UNUSED_EMAIL_SENDER: AccessEmailSender = {
  async sendRecoveryLink() {},
  async sendFirstPinCode() {},
};

const NOW = new Date("2026-10-01T16:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let fakeWsaa: FakeWsaaServer;
let credentials: ArcaTestCredentials;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("wsaa_token_renewal_wiring");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
  fakeWsaa = await startFakeWsaaServer();
  credentials = generateArcaTestCredentials();
}, 60_000);

afterAll(async () => {
  await fakeWsaa.close();
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function setUp() {
  return setUpRecovery(
    {
      databaseUrl: integrationDb.databaseUrl,
      emailSender: { transport: "log" },
      emailFrom: "Puro Sur <acceso@mail.staging.purosur.online>",
      emailReplyTo: "purosur.comarca@gmail.com",
      backofficeOrigin: "https://staging.purosur.online",
      arcaCertificate: { environment: "production", notAfter: new Date("2126-09-01T19:42:17Z") },
      arcaVitality: { endpoint: UNREACHABLE_WSFE_ENDPOINT },
      arcaWsaa: {
        endpoint: fakeWsaa.endpoint,
        certificatePem: credentials.certificatePem,
        privateKeyPem: credentials.privateKeyPem,
        certificateFingerprint: credentials.fingerprint,
      },
    },
    () => NOW,
    { emailSender: UNUSED_EMAIL_SENDER },
  );
}

async function pendingRenewals() {
  return sql`
    select 1
    from graphile_worker._private_jobs j
    join graphile_worker._private_tasks t on t.id = j.task_id
    where t.identifier = ${WSAA_TOKEN_RENEWAL_TASK_IDENTIFIER}
  `;
}

describe("the WSAA token renewal the server sets up on a real Postgres", () => {
  it("issues and persists a token on the first run and keeps it, without calling WSAA, on the second", async () => {
    const recovery = await setUp();
    try {
      await recovery.workerUtils.addJob(WSAA_TOKEN_RENEWAL_TASK_IDENTIFIER, {});
      await vi.waitFor(
        async () => {
          expect(await pendingRenewals()).toHaveLength(0);
          expect(
            await sql`select token, sign, certificate_fingerprint from arca_wsaa_tokens where service = 'wsfe'`,
          ).toEqual([
            {
              token: "FICTIONAL-TOKEN-0001",
              sign: "FICTIONAL-SIGN-0001",
              certificate_fingerprint: credentials.fingerprint,
            },
          ]);
        },
        { timeout: 20_000, interval: 100 },
      );
      expect(fakeWsaa.requests).toHaveLength(1);

      await recovery.workerUtils.addJob(WSAA_TOKEN_RENEWAL_TASK_IDENTIFIER, {});
      await vi.waitFor(async () => expect(await pendingRenewals()).toHaveLength(0), {
        timeout: 20_000,
        interval: 100,
      });

      expect(fakeWsaa.requests).toHaveLength(1);
      expect(await sql`select 1 from arca_wsaa_tokens`).toHaveLength(1);
    } finally {
      await recovery.close();
    }
  }, 90_000);
});
