import { FICTIONAL_CERTIFICATE_CUIT } from "@purosur/domain/fiscal/test-support";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  alerts,
  arcaWsaaTokens,
  creditNotes,
  fiscalRequests,
  fiscalTasks,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { buildJobHelpers } from "../test-support/job-helpers.js";
import {
  authorizationRequestRecord,
  insertRegisterWithPointOfSale,
} from "./test-support/authorization-request-fixtures.js";
import {
  answersInTurn,
  type FakeWsfeServer,
  startFakeWsfeServer,
} from "./test-support/fake-wsfe-server.js";
import { insertOfflineFiscalDocument } from "./test-support/offline-fiscal-document-fixtures.js";
import { UNCLEAR_OUTCOME_TASK_IDENTIFIER, unclearOutcomeJobs } from "./unclear-outcome-task.js";
import { WsfeTaxAuthorityLastAuthorized } from "./wsfe-tax-authority-last-authorized.js";
import { WsfeTaxAuthorityVouchers } from "./wsfe-tax-authority-vouchers.js";

const ANSWERED_AT = new Date("2026-10-06T15:00:02.000Z");
const SETTLED_NOW = new Date(ANSWERED_AT.getTime() + 61_000);
const FINGERPRINT = "AB:CD:EF";

let testDatabase: TestDatabase;
let server: FakeWsfeServer;
let now: Date;
let creditNotesRequested: string[];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  server = await startFakeWsfeServer();
});

afterAll(async () => {
  await server.close();
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  server.requests.length = 0;
  now = SETTLED_NOW;
  creditNotesRequested = [];
});

function taskUnderTest() {
  const jobs = unclearOutcomeJobs({
    now: () => now,
    vouchers: new WsfeTaxAuthorityVouchers({
      endpoint: server.endpoint,
      cuit: FICTIONAL_CERTIFICATE_CUIT,
      timeoutMs: 2_000,
    }),
    taxAuthority: new WsfeTaxAuthorityLastAuthorized({
      endpoint: server.endpoint,
      cuit: FICTIONAL_CERTIFICATE_CUIT,
      timeoutMs: 2_000,
    }),
    certificateFingerprint: FINGERPRINT,
    db: testDatabase.db,
    connections: { withConnection: (work) => work(testDatabase.db) },
    enqueueUnclearOutcome: async () => {},
    enqueueCreditNote: async (_, creditNoteId) => {
      creditNotesRequested.push(creditNoteId);
    },
  });
  const task = jobs.taskList[UNCLEAR_OUTCOME_TASK_IDENTIFIER];
  if (!task) {
    throw new Error("test setup: expected the registered unclear outcome task");
  }
  return { jobs, task };
}

async function issueWsaaToken() {
  await testDatabase.db.insert(arcaWsaaTokens).values({
    service: "wsfe",
    certificateFingerprint: FINGERPRINT,
    token: "FICTIONAL-TOKEN",
    sign: "FICTIONAL-SIGN",
    issuedAt: new Date(SETTLED_NOW.getTime() - 60_000),
    expiresAt: new Date(SETTLED_NOW.getTime() + 60 * 60_000),
  });
}

async function recordRequest(columns: Partial<typeof fiscalRequests.$inferInsert> = {}) {
  const registerId = await insertRegisterWithPointOfSale(testDatabase.db, {
    pointOfSaleNumber: 7,
    name: "caja-1",
  });
  const request = authorizationRequestRecord(registerId);
  await testDatabase.db.insert(fiscalRequests).values({ ...request, ...columns });
  return request.fiscalDocumentId;
}

async function unclearRequest(columns: Partial<typeof fiscalRequests.$inferInsert> = {}) {
  return recordRequest({
    answerKind: "unclear",
    unclearCodes: [],
    answeredAt: ANSWERED_AT,
    ...columns,
  });
}

async function storedRow(fiscalDocumentId: string) {
  const [row] = await testDatabase.db
    .select()
    .from(fiscalRequests)
    .where(eq(fiscalRequests.fiscalDocumentId, fiscalDocumentId));
  return row;
}

function requeuedAt(addJob: ReturnType<typeof buildJobHelpers>["addJob"]) {
  return addJob.mock.calls.map(([identifier, payload, spec]) => ({ identifier, payload, spec }));
}

describe("unclearOutcomeJobs", () => {
  it("registers the task that decides an unclear outcome and schedules nothing, since it runs when an outcome is unclear", () => {
    const { jobs } = taskUnderTest();

    expect(Object.keys(jobs.taskList)).toEqual([UNCLEAR_OUTCOME_TASK_IDENTIFIER]);
    expect(jobs.crontab).toEqual([]);
  });

  it("records the decision ARCA's answers lead to, and asks nothing again", async () => {
    await issueWsaaToken();
    const fiscalDocumentId = await unclearRequest();
    server.behave(
      answersInTurn("fe-comp-consultar-not-found.xml", "fe-comp-ultimo-autorizado.xml"),
    );
    const { task } = taskUnderTest();
    const { helpers, addJob } = buildJobHelpers();

    await task({ fiscalDocumentId }, helpers);

    expect(await storedRow(fiscalDocumentId)).toMatchObject({
      decision: "released",
      decidedAt: SETTLED_NOW,
    });
    expect(addJob).not.toHaveBeenCalled();
  });

  describe("a document ARCA authorized although another voucher of its sale stands", () => {
    async function withOfflineVoucher(fiscalDocumentId: string) {
      const row = await storedRow(fiscalDocumentId);
      if (!row) {
        throw new Error("test setup: the request was not recorded");
      }
      await insertOfflineFiscalDocument(testDatabase.db, {
        registerId: row.registerId,
        pointOfSale: 31,
        fortnight: { start: "2026-10-01", end: "2026-10-15" },
        number: 5,
        saleId: row.saleId,
      });
      return row;
    }

    it("adopts it and requests one credit note for the authorization, keeping the other voucher", async () => {
      await issueWsaaToken();
      const fiscalDocumentId = await unclearRequest();
      const { saleId } = await withOfflineVoucher(fiscalDocumentId);
      server.behave(answersInTurn("fe-comp-consultar-found.xml"));
      const { task } = taskUnderTest();

      await task({ fiscalDocumentId }, buildJobHelpers().helpers);

      expect(await storedRow(fiscalDocumentId)).toMatchObject({ decision: "adopted" });
      const rows = await testDatabase.db.select().from(creditNotes);
      expect(rows).toMatchObject([
        {
          saleId,
          pointOfSale: 7,
          associatedVoucherType: 11,
          associatedNumber: 42,
          keptVoucherType: 11,
          keptPointOfSale: 31,
          keptNumber: 5,
          total: 1500,
          receiverTaxStatusCode: 5,
        },
      ]);
      expect(creditNotesRequested).toEqual([rows[0]?.id]);
    });

    it("requests no credit note when the authorization is the only voucher of its sale", async () => {
      await issueWsaaToken();
      const fiscalDocumentId = await unclearRequest();
      server.behave(answersInTurn("fe-comp-consultar-found.xml"));
      const { task } = taskUnderTest();

      await task({ fiscalDocumentId }, buildJobHelpers().helpers);

      expect(await storedRow(fiscalDocumentId)).toMatchObject({ decision: "adopted" });
      expect(await testDatabase.db.select().from(creditNotes)).toEqual([]);
      expect(creditNotesRequested).toEqual([]);
    });
  });

  it("marks the authorization as invoicing outside the register, with an alert and a task, when the voucher at the number is not the document's", async () => {
    await issueWsaaToken();
    const fiscalDocumentId = await unclearRequest({ total: 999 });
    server.behave(answersInTurn("fe-comp-consultar-found.xml"));
    const { task } = taskUnderTest();

    await task({ fiscalDocumentId }, buildJobHelpers().helpers);

    expect(await storedRow(fiscalDocumentId)).toMatchObject({ decision: "conflicting" });
    expect(await testDatabase.db.select().from(fiscalTasks)).toMatchObject([
      {
        kind: "external_invoicing",
        pointOfSale: 7,
        documentType: "factura_c",
        number: 42,
        reason: { issuedOn: "2026-10-06", total: 1500, authorizationCode: "74123456789012" },
      },
    ]);
    expect(
      (await testDatabase.db.select().from(alerts)).filter(
        (alert) => alert.kind === "external_billing",
      ),
    ).toMatchObject([{ scope: "7:factura_c:42" }]);
    expect(await testDatabase.db.select().from(creditNotes)).toEqual([]);
  });

  it("asks again with the document's key and top priority at the time a pending decision names", async () => {
    await issueWsaaToken();
    const fiscalDocumentId = await unclearRequest();
    now = new Date(ANSWERED_AT.getTime() + 10_000);
    const { task } = taskUnderTest();
    const { helpers, addJob } = buildJobHelpers();

    await task({ fiscalDocumentId }, helpers);

    expect((await storedRow(fiscalDocumentId))?.decision).toBeNull();
    expect(requeuedAt(addJob)).toEqual([
      {
        identifier: UNCLEAR_OUTCOME_TASK_IDENTIFIER,
        payload: { fiscalDocumentId },
        spec: {
          jobKey: `${UNCLEAR_OUTCOME_TASK_IDENTIFIER}:${fiscalDocumentId}`,
          jobKeyMode: "replace",
          priority: -20,
          runAt: new Date(ANSWERED_AT.getTime() + 60_000),
        },
      },
    ]);
  });

  it("ends without asking again when the document was authorized or is unknown", async () => {
    await issueWsaaToken();
    const authorized = await recordRequest({
      answerKind: "authorized",
      authorizationCode: "74123456789012",
      authorizationCodeDueOn: "2026-10-16",
      answeredAt: ANSWERED_AT,
    });
    const { task } = taskUnderTest();
    const { helpers, addJob } = buildJobHelpers();

    await task({ fiscalDocumentId: authorized }, helpers);
    await task({ fiscalDocumentId: crypto.randomUUID() }, helpers);

    expect(server.requests).toEqual([]);
    expect(addJob).not.toHaveBeenCalled();
  });

  it.each([{}, { fiscalDocumentId: 7 }, { fiscalDocumentId: "" }, null])(
    "fails a job whose payload names no document (%j), asking ARCA nothing",
    async (payload) => {
      const { task } = taskUnderTest();

      await expect(task(payload, buildJobHelpers().helpers)).rejects.toThrow();

      expect(server.requests).toEqual([]);
    },
  );
});
