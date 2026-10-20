import { FACTURA_C_DOCUMENT_TYPE } from "@purosur/domain";
import { FICTIONAL_CERTIFICATE_CUIT } from "@purosur/domain/fiscal/test-support";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessEmailSender } from "../credentials/recovery-email-sender.js";
import { fiscalRequests, taxAuthorityLastAuthorizedNumbers } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { setUpRecovery } from "../server.js";
import { buildChangesRouteApp, pulledPage } from "../sync/test-support/changes-route.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import {
  FICTIONAL_RECOVERY_REPLY_TO,
  FICTIONAL_RECOVERY_SENDER,
} from "../test-support/recovery-email.js";
import {
  enqueueNumberingDiagnosisJob,
  enqueueNumberingReconciliationJob,
} from "./graphile-numbering-conflict-queue.js";
import {
  authorizationRequestRecord,
  insertRegisterWithPointOfSale,
} from "./test-support/authorization-request-fixtures.js";
import {
  answersInTurn,
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
const ANSWERED_AT = new Date(NOW.getTime() - 61_000);

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let fakeWsfe: FakeWsfeServer;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("numbering_conflict_wiring");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  fakeWsfe = await startFakeWsfeServer();
  await sql`
    insert into arca_wsaa_tokens (service, certificate_fingerprint, token, sign, issued_at, expires_at)
    values ('wsfe', ${FINGERPRINT}, 'FICTIONAL-TOKEN-0001', 'FICTIONAL-SIGN-0001',
            ${new Date("2125-12-31T18:00:00.000Z")}, ${new Date("2126-01-01T06:00:00.000Z")})
  `;
}, 60_000);

afterAll(async () => {
  await fakeWsfe.close();
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

beforeEach(() => {
  fakeWsfe.requests.length = 0;
});

function recoveryEnv() {
  return {
    databaseUrl: integrationDb.databaseUrl,
    emailSender: { transport: "log" as const },
    emailFrom: FICTIONAL_RECOVERY_SENDER,
    emailReplyTo: FICTIONAL_RECOVERY_REPLY_TO,
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

async function registerHoldingPointOfSale(pointOfSale: number, count: number) {
  const db = drizzle(sql);
  const registerId = await insertRegisterWithPointOfSale(db, {
    pointOfSaleNumber: pointOfSale,
    name: `caja-${pointOfSale}`,
  });
  await db
    .insert(taxAuthorityLastAuthorizedNumbers)
    .values({ pointOfSaleNumber: pointOfSale, lastAuthorized: count, readAt: ANSWERED_AT });
  const { deviceToken } = await insertEnrolledInstallation(db, {
    now: NOW,
    existingRegisterId: registerId,
  });
  return { registerId, deviceToken };
}

async function leftUnclearByNumbering(
  registerId: string,
  pointOfSale: number,
  number: number,
  issuedOn: string,
) {
  const request = authorizationRequestRecord(registerId, { pointOfSale, number, issuedOn });
  await drizzle(sql)
    .insert(fiscalRequests)
    .values({ ...request, answerKind: "unclear", unclearCodes: [10016], answeredAt: ANSWERED_AT });
  return request.fiscalDocumentId;
}

function reconciliationAskingAgainLater(pointOfSale: number) {
  return sql`select 1 from graphile_worker._private_jobs
    where key = ${`reconcile-numbering-conflict:${pointOfSale}`} and run_at > ${NOW.toISOString()}::timestamptz
    and locked_at is null and last_error is null`;
}

describe("the numbering conflict work the server sets up on a real Postgres", () => {
  it("freezes the point of sale on a collision and, once ARCA's last number is read, alerts, continues the series and lifts the freeze", async () => {
    const { registerId, deviceToken } = await registerHoldingPointOfSale(7, 1);
    const fiscalDocumentId = await leftUnclearByNumbering(registerId, 7, 40, "2126-01-01");
    fakeWsfe.behave(
      answersInTurn(
        "fe-comp-ultimo-autorizado.xml",
        "fe-comp-consultar-found.xml",
        "fe-comp-ultimo-autorizado-token-error.xml",
      ),
    );
    const recovery = await setUpRecovery(recoveryEnv(), () => NOW, {
      emailSender: UNUSED_EMAIL_SENDER,
      schedules: false,
    });
    const app = buildChangesRouteApp(recovery.db, { now: () => NOW });
    const pointOfSaleRow = async () => {
      const page = await pulledPage(app, 0, deviceToken, { entity: "register_point_of_sale" });
      const last = page.changes.at(-1);
      return last !== undefined && "row" in last ? last.row : undefined;
    };
    try {
      await recovery.db.transaction((transaction) =>
        enqueueNumberingDiagnosisJob(transaction, fiscalDocumentId),
      );

      await vi.waitFor(
        async () => expect(await pointOfSaleRow()).toMatchObject({ numbering_frozen: true }),
        {
          timeout: 20_000,
          interval: 100,
        },
      );
      expect(await pointOfSaleRow()).toMatchObject({ tax_authority_last_authorized_number: 1 });
      await vi.waitFor(
        async () => expect(await reconciliationAskingAgainLater(7)).toHaveLength(1),
        {
          timeout: 20_000,
          interval: 100,
        },
      );

      fakeWsfe.requests.length = 0;
      fakeWsfe.behave(
        answersInTurn("fe-comp-ultimo-autorizado-advanced.xml", "fe-comp-consultar-found.xml"),
      );
      await recovery.db.transaction((transaction) =>
        enqueueNumberingReconciliationJob(transaction, 7),
      );
      await vi.waitFor(
        async () =>
          expect(await pointOfSaleRow()).toMatchObject({
            numbering_frozen: false,
            tax_authority_last_authorized_number: 3,
          }),
        { timeout: 20_000, interval: 100 },
      );
      expect(
        await sql`select scope from alerts where kind = 'external_billing' order by scope`,
      ).toEqual([
        { scope: `7:${FACTURA_C_DOCUMENT_TYPE}:2` },
        { scope: `7:${FACTURA_C_DOCUMENT_TYPE}:3` },
      ]);
      expect(await sql`select kind, number from fiscal_tasks order by number`).toEqual([
        { kind: "external_invoicing", number: 2 },
        { kind: "external_invoicing", number: 3 },
      ]);
    } finally {
      await app.close();
      await recovery.close();
    }
  }, 90_000);

  it.each([
    ["holds no voucher at the numbers", 9, "fe-comp-consultar-not-found.xml"],
    ["gives no answer about the numbers", 10, "fe-comp-consultar-token-error.xml"],
  ])(
    "alerts nothing, opens no task and keeps the point of sale frozen while ARCA %s",
    async (_case, pointOfSale, file) => {
      const { registerId } = await registerHoldingPointOfSale(pointOfSale, 1);
      const fiscalDocumentId = await leftUnclearByNumbering(
        registerId,
        pointOfSale,
        40,
        "2126-01-01",
      );
      fakeWsfe.behave(
        answersInTurn(
          "fe-comp-ultimo-autorizado.xml",
          "fe-comp-consultar-found.xml",
          "fe-comp-ultimo-autorizado-token-error.xml",
        ),
      );
      const recovery = await setUpRecovery(recoveryEnv(), () => NOW, {
        emailSender: UNUSED_EMAIL_SENDER,
        schedules: false,
      });
      try {
        await recovery.db.transaction((transaction) =>
          enqueueNumberingDiagnosisJob(transaction, fiscalDocumentId),
        );
        await vi.waitFor(
          async () =>
            expect(
              await sql`select 1 from numbering_freezes where point_of_sale_number = ${pointOfSale}`,
            ).toHaveLength(1),
          {
            timeout: 20_000,
            interval: 100,
          },
        );
        await vi.waitFor(
          async () => expect(await reconciliationAskingAgainLater(pointOfSale)).toHaveLength(1),
          { timeout: 20_000, interval: 100 },
        );

        fakeWsfe.requests.length = 0;
        fakeWsfe.behave(answersInTurn("fe-comp-ultimo-autorizado-advanced.xml", file));
        await recovery.db.transaction((transaction) =>
          enqueueNumberingReconciliationJob(transaction, pointOfSale),
        );
        await vi.waitFor(
          async () => {
            expect(
              fakeWsfe.requests.filter((request) => request.includes("FECompConsultar")),
            ).not.toEqual([]);
            expect(await reconciliationAskingAgainLater(pointOfSale)).toHaveLength(1);
          },
          { timeout: 20_000, interval: 100 },
        );

        expect(
          await sql`select 1 from numbering_freezes where point_of_sale_number = ${pointOfSale}`,
        ).toHaveLength(1);
        expect(
          await sql`select 1 from alerts where kind = 'external_billing' and scope like ${`${pointOfSale}:%`}`,
        ).toEqual([]);
        expect(await sql`select 1 from fiscal_tasks where point_of_sale = ${pointOfSale}`).toEqual(
          [],
        );
      } finally {
        await recovery.close();
      }
    },
    90_000,
  );

  it("leaves the point of sale unfrozen when the document is only a date behind", async () => {
    const { registerId, deviceToken } = await registerHoldingPointOfSale(8, 1);
    const fiscalDocumentId = await leftUnclearByNumbering(registerId, 8, 2, "2026-10-05");
    fakeWsfe.behave(answersInTurn("fe-comp-ultimo-autorizado.xml", "fe-comp-consultar-found.xml"));
    const recovery = await setUpRecovery(recoveryEnv(), () => NOW, {
      emailSender: UNUSED_EMAIL_SENDER,
      schedules: false,
    });
    const app = buildChangesRouteApp(recovery.db, { now: () => NOW });
    try {
      await recovery.db.transaction((transaction) =>
        enqueueNumberingDiagnosisJob(transaction, fiscalDocumentId),
      );

      await vi.waitFor(
        async () =>
          expect(
            await sql`select diagnosis from fiscal_requests where fiscal_document_id = ${fiscalDocumentId}`,
          ).toEqual([{ diagnosis: "date_behind" }]),
        { timeout: 20_000, interval: 100 },
      );
      const page = await pulledPage(app, 0, deviceToken, { entity: "register_point_of_sale" });
      const last = page.changes.at(-1);
      expect(last !== undefined && "row" in last ? last.row : undefined).toMatchObject({
        numbering_frozen: false,
      });
      expect(await sql`select 1 from numbering_freezes where point_of_sale_number = 8`).toEqual([]);
    } finally {
      await app.close();
      await recovery.close();
    }
  }, 90_000);
});
