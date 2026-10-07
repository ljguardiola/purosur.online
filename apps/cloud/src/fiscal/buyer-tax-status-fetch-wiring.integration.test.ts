import { FICTIONAL_CERTIFICATE_CUIT } from "@purosur/domain/fiscal/test-support";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AccessEmailSender } from "../access/recovery-email-sender.js";
import { setUpRecovery } from "../server.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import {
  BUYER_TAX_STATUS_FETCH_TASK_IDENTIFIER,
  enqueueBuyerTaxStatusFetch,
} from "./buyer-tax-status-fetch-task.js";
import {
  answers,
  type FakeWsfeServer,
  startFakeWsfeServer,
  UNREACHABLE_WSFE_ENDPOINT,
} from "./test-support/fake-wsfe-server.js";
import { RECORDED_BUYER_TAX_STATUS_OPTIONS } from "./test-support/recorded-buyer-tax-status-options.js";

const UNUSED_EMAIL_SENDER: AccessEmailSender = {
  async sendRecoveryLink() {},
  async sendFirstPinCode() {},
};

const FINGERPRINT = "AA:BB:CC";
const FETCHED_AT = new Date("2126-01-01T00:00:00.000Z");
const NEXT_FETCH_AT = new Date("2126-01-01T01:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let fakeWsfe: FakeWsfeServer;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("buyer_tax_status_fetch_wiring");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
  fakeWsfe = await startFakeWsfeServer(answers("fe-param-get-condicion-iva-receptor.xml"));
}, 60_000);

afterAll(async () => {
  await fakeWsfe.close();
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function scheduledFetches() {
  return sql<{ runAt: Date }[]>`
    select j.run_at as "runAt"
    from graphile_worker._private_jobs j
    join graphile_worker._private_tasks t on t.id = j.task_id
    where t.identifier = ${BUYER_TAX_STATUS_FETCH_TASK_IDENTIFIER}
      and j.key = ${BUYER_TAX_STATUS_FETCH_TASK_IDENTIFIER}
  `;
}

describe("the buyer tax-status fetch the server sets up on a real Postgres", () => {
  it("stores the set ARCA answers as a new version for every register, and fetches again an hour on", async () => {
    await sql`
      insert into arca_wsaa_tokens (service, certificate_fingerprint, token, sign, issued_at, expires_at)
      values ('wsfe', ${FINGERPRINT}, 'FICTIONAL-TOKEN-0001', 'FICTIONAL-SIGN-0001',
              ${new Date("2125-12-31T18:00:00.000Z")}, ${new Date("2126-01-01T06:00:00.000Z")})
    `;
    const recovery = await setUpRecovery(
      {
        databaseUrl: integrationDb.databaseUrl,
        emailSender: { transport: "log" },
        emailFrom: "Puro Sur <acceso@mail.staging.purosur.online>",
        emailReplyTo: "purosur.comarca@gmail.com",
        backofficeOrigin: "https://staging.purosur.online",
        arcaCertificate: { environment: "production", notAfter: new Date("2126-09-01T19:42:17Z") },
        arcaVitality: { endpoint: UNREACHABLE_WSFE_ENDPOINT },
        arcaBuyerTaxStatus: {
          endpoint: fakeWsfe.endpoint,
          cuit: FICTIONAL_CERTIFICATE_CUIT,
          certificateFingerprint: FINGERPRINT,
        },
      },
      () => FETCHED_AT,
      { emailSender: UNUSED_EMAIL_SENDER },
    );
    try {
      await enqueueBuyerTaxStatusFetch(recovery.workerUtils);

      await vi.waitFor(
        async () => {
          const sets = await sql<{ id: string; paramsVersion: number; options: unknown }[]>`
            select id, params_version as "paramsVersion", options from buyer_tax_status_sets`;
          expect(sets).toEqual([
            {
              id: expect.any(String),
              paramsVersion: 1,
              options: RECORDED_BUYER_TAX_STATUS_OPTIONS,
            },
          ]);
          expect(
            await sql`select 1 from changes where entity = 'buyer_tax_status_set' and entity_id = ${sets[0]?.id ?? ""}`,
          ).toHaveLength(1);
          expect(await scheduledFetches()).toEqual([{ runAt: NEXT_FETCH_AT }]);
        },
        { timeout: 20_000, interval: 100 },
      );
      expect(fakeWsfe.requests[0]).toContain("FICTIONAL-TOKEN-0001");
    } finally {
      await recovery.close();
    }
  }, 90_000);
});
