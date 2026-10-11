import { FICTIONAL_CERTIFICATE_CUIT } from "@purosur/domain/fiscal/test-support";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AccessEmailSender } from "../credentials/recovery-email-sender.js";
import { fiscalRequests } from "../platform/db/schema.js";
import { setUpRecovery } from "../server.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { enqueueUnclearOutcomeJob } from "./graphile-unclear-outcome-queue.js";
import {
  authorizationRequestRecord,
  insertRegisterWithPointOfSale,
} from "./test-support/authorization-request-fixtures.js";
import {
  answers,
  type FakeWsfeServer,
  startFakeWsfeServer,
  UNREACHABLE_WSFE_ENDPOINT,
} from "./test-support/fake-wsfe-server.js";

const UNUSED_EMAIL_SENDER: AccessEmailSender = {
  async sendRecoveryLink() {},
  async sendFirstPinCode() {},
};

const FINGERPRINT = "AA:BB:CC";
const NOW = new Date("2126-01-01T00:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let fakeWsfe: FakeWsfeServer;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("unclear_outcome_wiring");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
  fakeWsfe = await startFakeWsfeServer(answers("fe-comp-consultar-found.xml"));
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
    emailReplyTo: "consultas@example.test",
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

describe("the unclear outcome decisions the server sets up on a real Postgres", () => {
  it("decides an enqueued unclear document from the voucher ARCA holds at its number", async () => {
    await sql`
      insert into arca_wsaa_tokens (service, certificate_fingerprint, token, sign, issued_at, expires_at)
      values ('wsfe', ${FINGERPRINT}, 'FICTIONAL-TOKEN-0001', 'FICTIONAL-SIGN-0001',
              ${new Date("2125-12-31T18:00:00.000Z")}, ${new Date("2126-01-01T06:00:00.000Z")})
    `;
    const db = drizzle(sql);
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 7,
      name: "caja-1",
    });
    const request = authorizationRequestRecord(registerId);
    await db.insert(fiscalRequests).values({
      ...request,
      answerKind: "unclear",
      answeredAt: new Date(NOW.getTime() - 61_000),
    });
    const recovery = await setUpRecovery(recoveryEnv(), () => NOW, {
      emailSender: UNUSED_EMAIL_SENDER,
    });
    try {
      await recovery.db.transaction((transaction) =>
        enqueueUnclearOutcomeJob(transaction, request.fiscalDocumentId, NOW),
      );

      await vi.waitFor(
        async () => {
          expect(
            await sql`select decision, adopted_authorization_code as code from fiscal_requests`,
          ).toEqual([{ decision: "adopted", code: "74123456789012" }]);
        },
        { timeout: 20_000, interval: 100 },
      );
      expect(fakeWsfe.requests[0]).toContain("FECompConsultar");
    } finally {
      await recovery.close();
    }
  }, 90_000);
});
