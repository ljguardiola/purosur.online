import { FICTIONAL_CERTIFICATE_CUIT } from "@purosur/domain/fiscal/test-support";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessEmailSender } from "../credentials/recovery-email-sender.js";
import { fiscalRequests } from "../platform/db/schema.js";
import { setUpRecovery } from "../server.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import {
  FICTIONAL_RECOVERY_REPLY_TO,
  FICTIONAL_RECOVERY_SENDER,
} from "../test-support/recovery-email.js";
import { enqueueUnclearOutcomeJob } from "./graphile-unclear-outcome-queue.js";
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
import { insertOfflineFiscalDocument } from "./test-support/offline-fiscal-document-fixtures.js";

const UNUSED_EMAIL_SENDER: AccessEmailSender = {
  async sendRecoveryLink() {},
  async sendFirstPinCode() {},
};

const FINGERPRINT = "AA:BB:CC";
const NOW = new Date("2126-01-01T00:00:00.000Z");
const ANSWERED_AT = new Date(NOW.getTime() - 61_000);
const ALREADY_DUE = new Date(0);
const ISSUE_DAY_COMPACT = "21251231";
const TIMEOUT = { timeout: 20_000, interval: 100 };

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let fakeWsfe: FakeWsfeServer;
let nextPointOfSale = 100;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("orphan_authorization_wiring");
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

async function unclearRequestOfASaleAlsoIssuedOffline(
  columns: Partial<typeof fiscalRequests.$inferInsert> = {},
) {
  nextPointOfSale += 2;
  const pointOfSale = nextPointOfSale;
  const db = drizzle(sql);
  const registerId = await insertRegisterWithPointOfSale(db, {
    pointOfSaleNumber: pointOfSale,
    name: `caja-${pointOfSale}`,
  });
  const request = authorizationRequestRecord(registerId, { pointOfSale, number: 42 });
  await db.insert(fiscalRequests).values({
    ...request,
    answerKind: "unclear",
    unclearCodes: [],
    answeredAt: ANSWERED_AT,
    ...columns,
  });
  await insertOfflineFiscalDocument(db, {
    registerId,
    pointOfSale: pointOfSale + 1,
    fortnight: { start: "2125-12-16", end: "2125-12-31" },
    number: 5,
    saleId: request.saleId,
  });
  return { request, pointOfSale };
}

async function decide(fiscalDocumentId: string, run: () => Promise<void>) {
  const recovery = await setUpRecovery(recoveryEnv(), () => NOW, {
    emailSender: UNUSED_EMAIL_SENDER,
    schedules: false,
  });
  try {
    await recovery.db.transaction((transaction) =>
      enqueueUnclearOutcomeJob(transaction, fiscalDocumentId, ALREADY_DUE),
    );
    await run();
  } finally {
    await recovery.close();
  }
}

function sentValue(request: string | undefined, element: string): string | undefined {
  return new RegExp(`<(?:\\w+:)?${element}>([^<]*)</(?:\\w+:)?${element}>`).exec(
    request ?? "",
  )?.[1];
}

describe("the orphan authorizations the server sets up on a real Postgres", () => {
  it("issues one credit note C for an authorization adopted after the sale was also issued offline, associated to it and dated the day it is issued", async () => {
    const { request, pointOfSale } = await unclearRequestOfASaleAlsoIssuedOffline();
    fakeWsfe.behave(
      answersInTurn(
        "fe-comp-consultar-found.xml",
        "fe-comp-ultimo-autorizado-credit-note.xml",
        "fe-cae-solicitar-credit-note-authorized.xml",
      ),
    );

    await decide(request.fiscalDocumentId, async () => {
      await vi.waitFor(
        async () =>
          expect(
            await sql`select answer_kind, number, authorization_code from orphan_credit_notes where point_of_sale = ${pointOfSale}`,
          ).toEqual([
            { answer_kind: "authorized", number: 5, authorization_code: "74123456789055" },
          ]),
        TIMEOUT,
      );
    });

    expect(fakeWsfe.requests).toHaveLength(3);
    expect(fakeWsfe.requests[0]).toContain("FECompConsultar");
    expect(fakeWsfe.requests[1]).toContain("FECompUltimoAutorizado");
    expect(sentValue(fakeWsfe.requests[1], "CbteTipo")).toBe("13");
    const [, , solicitation] = fakeWsfe.requests;
    expect(solicitation).toContain("FECAESolicitar");
    expect(sentValue(solicitation, "CbteTipo")).toBe("13");
    expect(sentValue(solicitation, "PtoVta")).toBe(String(pointOfSale));
    expect(sentValue(solicitation, "CbteFch")).toBe(ISSUE_DAY_COMPACT);
    const associated = /<(?:\w+:)?CbtesAsoc>([\s\S]*?)<\/(?:\w+:)?CbtesAsoc>/.exec(
      solicitation ?? "",
    )?.[1];
    expect(sentValue(associated, "Tipo")).toBe("11");
    expect(sentValue(associated, "PtoVta")).toBe(String(pointOfSale));
    expect(sentValue(associated, "Nro")).toBe("42");
    expect(await sql`select 1 from fiscal_tasks`).toEqual([]);
  }, 90_000);

  it("opens a task for a person, and no credit note, when the credit note is rejected, and never asks again", async () => {
    const { request, pointOfSale } = await unclearRequestOfASaleAlsoIssuedOffline();
    fakeWsfe.behave(
      answersInTurn(
        "fe-comp-consultar-found.xml",
        "fe-comp-ultimo-autorizado-credit-note.xml",
        "fe-cae-solicitar-credit-note-rejected.xml",
      ),
    );

    await decide(request.fiscalDocumentId, async () => {
      await vi.waitFor(
        async () =>
          expect(
            await sql`select kind, document_type, point_of_sale from fiscal_tasks where point_of_sale = ${pointOfSale}`,
          ).toEqual([
            {
              kind: "credit_note_rejected",
              document_type: "credit_note_c",
              point_of_sale: pointOfSale,
            },
          ]),
        TIMEOUT,
      );
      expect(
        await sql`select answer_kind from orphan_credit_notes where point_of_sale = ${pointOfSale}`,
      ).toEqual([{ answer_kind: "rejected" }]);
      expect(
        await sql`select 1 from graphile_worker._private_jobs j
          join graphile_worker._private_tasks t on t.id = j.task_id
          where t.identifier = 'issue-credit-note'`,
      ).toEqual([]);
    });

    expect(fakeWsfe.requests).toHaveLength(3);
  }, 90_000);

  it("opens an alert and a task, and requests no credit note, when the voucher at the number is not the document's", async () => {
    const { request, pointOfSale } = await unclearRequestOfASaleAlsoIssuedOffline({ total: 999 });
    fakeWsfe.behave(answersInTurn("fe-comp-consultar-found.xml"));

    await decide(request.fiscalDocumentId, async () => {
      await vi.waitFor(
        async () =>
          expect(
            await sql`select kind, number from fiscal_tasks where point_of_sale = ${pointOfSale}`,
          ).toEqual([{ kind: "external_invoicing", number: 42 }]),
        TIMEOUT,
      );
      expect(
        await sql`select scope from alerts where kind = 'external_billing' and scope like ${`${pointOfSale}:%`}`,
      ).toEqual([{ scope: `${pointOfSale}:factura_c:42` }]);
    });

    expect(
      await sql`select 1 from orphan_credit_notes where point_of_sale = ${pointOfSale}`,
    ).toEqual([]);
    expect(fakeWsfe.requests).toHaveLength(1);
  }, 90_000);
});
