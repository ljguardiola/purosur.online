import { FICTIONAL_CERTIFICATE_CUIT } from "@purosur/domain/fiscal/test-support";
import { sql as sqlTag } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AccessEmailSender } from "../access/recovery-email-sender.js";
import { setUpRecovery } from "../server.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { enqueueTaxAuthorityCountJob } from "./graphile-tax-authority-count-queue.js";
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
const READ_AT = new Date("2126-01-01T00:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let fakeWsfe: FakeWsfeServer;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("tax_authority_count_wiring");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
  fakeWsfe = await startFakeWsfeServer(answers("fe-comp-ultimo-autorizado.xml"));
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

describe("the tax authority's count the server sets up on a real Postgres", () => {
  it("reads the last authorized number of an enqueued point of sale from ARCA and keeps it", async () => {
    await sql`
      insert into arca_wsaa_tokens (service, certificate_fingerprint, token, sign, issued_at, expires_at)
      values ('wsfe', ${FINGERPRINT}, 'FICTIONAL-TOKEN-0001', 'FICTIONAL-SIGN-0001',
              ${new Date("2125-12-31T18:00:00.000Z")}, ${new Date("2126-01-01T06:00:00.000Z")})
    `;
    const recovery = await setUpRecovery(recoveryEnv(), () => READ_AT, {
      emailSender: UNUSED_EMAIL_SENDER,
    });
    try {
      await recovery.db.transaction((transaction) => enqueueTaxAuthorityCountJob(transaction, 7));

      await vi.waitFor(
        async () => {
          expect(
            await sql`select point_of_sale_number as "pointOfSale", last_authorized as "lastAuthorized"
              from tax_authority_last_authorized_numbers`,
          ).toEqual([{ pointOfSale: 7, lastAuthorized: 41 }]);
        },
        { timeout: 20_000, interval: 100 },
      );
      expect(fakeWsfe.requests[0]).toContain("FICTIONAL-TOKEN-0001");
      expect(fakeWsfe.requests[0]).toContain("FECompUltimoAutorizado");
    } finally {
      await recovery.close();
    }
  }, 90_000);

  it("hands out dedicated connections to the same database", async () => {
    const recovery = await setUpRecovery(recoveryEnv(), () => READ_AT, {
      emailSender: UNUSED_EMAIL_SENDER,
    });
    try {
      const rows = await recovery.connections.withConnection((db) =>
        db.execute(sqlTag`select current_database() as name`),
      );

      expect(rows).toHaveLength(1);
    } finally {
      await recovery.close();
    }
  }, 90_000);
});
