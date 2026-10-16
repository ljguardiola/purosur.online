import { FICTIONAL_CERTIFICATE_CUIT } from "@purosur/domain/fiscal/test-support";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { arcaWsaaTokens, fiscalTasks, orphanCreditNotes } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { buildJobHelpers } from "../test-support/job-helpers.js";
import {
  ORPHAN_CREDIT_NOTE_TASK_IDENTIFIER,
  orphanCreditNoteJobs,
} from "./orphan-credit-note-task.js";
import { insertRegisterWithPointOfSale } from "./test-support/authorization-request-fixtures.js";
import {
  answersInTurn,
  type FakeWsfeServer,
  startFakeWsfeServer,
} from "./test-support/fake-wsfe-server.js";
import { WsfeTaxAuthorityCreditNotes } from "./wsfe-tax-authority-credit-notes.js";
import { WsfeTaxAuthorityLastAuthorized } from "./wsfe-tax-authority-last-authorized.js";
import { WsfeTaxAuthorityVouchers } from "./wsfe-tax-authority-vouchers.js";

const NOW = new Date("2026-10-08T01:30:00.000Z");
const ISSUE_DAY = "2026-10-07";
const FINGERPRINT = "AB:CD:EF";
const CREATED_AT = new Date("2026-10-08T00:00:00.000Z");

let testDatabase: TestDatabase;
let server: FakeWsfeServer;

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
});

function taskUnderTest() {
  const connection = {
    endpoint: server.endpoint,
    cuit: FICTIONAL_CERTIFICATE_CUIT,
    timeoutMs: 2_000,
  };
  const jobs = orphanCreditNoteJobs({
    now: () => NOW,
    vouchers: new WsfeTaxAuthorityVouchers(connection),
    taxAuthority: new WsfeTaxAuthorityLastAuthorized(connection),
    creditNotes: new WsfeTaxAuthorityCreditNotes(connection),
    certificateFingerprint: FINGERPRINT,
    db: testDatabase.db,
    connections: { withConnection: (work) => work(testDatabase.db) },
  });
  const task = jobs.taskList[ORPHAN_CREDIT_NOTE_TASK_IDENTIFIER];
  if (!task) {
    throw new Error("test setup: expected the registered orphan credit note task");
  }
  return { jobs, task };
}

async function issueWsaaToken() {
  await testDatabase.db.insert(arcaWsaaTokens).values({
    service: "wsfe",
    certificateFingerprint: FINGERPRINT,
    token: "FICTIONAL-TOKEN",
    sign: "FICTIONAL-SIGN",
    issuedAt: new Date(NOW.getTime() - 60_000),
    expiresAt: new Date(NOW.getTime() + 60 * 60_000),
  });
}

async function aCreditNote(columns: Partial<typeof orphanCreditNotes.$inferInsert> = {}) {
  const registerId = await insertRegisterWithPointOfSale(testDatabase.db, {
    pointOfSaleNumber: 7,
    name: "caja-1",
  });
  const id = crypto.randomUUID();
  await testDatabase.db.insert(orphanCreditNotes).values({
    id,
    registerId,
    saleId: crypto.randomUUID(),
    pointOfSale: 7,
    associatedVoucherType: 11,
    associatedNumber: 42,
    keptVoucherType: 11,
    keptPointOfSale: 31,
    keptNumber: 5,
    total: 12_550,
    receiverTaxStatusCode: 5,
    createdAt: CREATED_AT,
    ...columns,
  });
  return id;
}

async function storedRow(creditNoteId: string) {
  const [row] = await testDatabase.db
    .select()
    .from(orphanCreditNotes)
    .where(eq(orphanCreditNotes.id, creditNoteId));
  return row;
}

function sentValue(request: string | undefined, element: string): string | undefined {
  return new RegExp(`<(?:\\w+:)?${element}>([^<]*)</(?:\\w+:)?${element}>`).exec(
    request ?? "",
  )?.[1];
}

describe("orphanCreditNoteJobs", () => {
  it("registers the task that issues an orphan credit note and schedules nothing, since it runs when a credit note is requested", () => {
    const { jobs } = taskUnderTest();

    expect(Object.keys(jobs.taskList)).toEqual([ORPHAN_CREDIT_NOTE_TASK_IDENTIFIER]);
    expect(jobs.crontab).toEqual([]);
  });

  it("issues one credit note C numbered after the last one ARCA authorized, associated to the orphan and dated the day it is issued", async () => {
    await issueWsaaToken();
    const creditNoteId = await aCreditNote();
    server.behave(
      answersInTurn(
        "fe-comp-ultimo-autorizado-credit-note.xml",
        "fe-cae-solicitar-credit-note-authorized.xml",
      ),
    );
    const { task } = taskUnderTest();
    const { helpers, addJob } = buildJobHelpers();

    await task({ creditNoteId }, helpers);

    expect(server.requests).toHaveLength(2);
    expect(server.requests[0]).toContain("FECompUltimoAutorizado");
    expect(sentValue(server.requests[0], "CbteTipo")).toBe("13");
    const [, solicitation] = server.requests;
    expect(solicitation).toContain("FECAESolicitar");
    expect(sentValue(solicitation, "CbteTipo")).toBe("13");
    expect(sentValue(solicitation, "CbteDesde")).toBe("5");
    expect(sentValue(solicitation, "CbteFch")).toBe("20261007");
    expect(solicitation).toMatch(/<(?:\w+:)?CbtesAsoc>/);
    expect(await storedRow(creditNoteId)).toMatchObject({
      number: 5,
      issuedOn: ISSUE_DAY,
      answerKind: "authorized",
      authorizationCode: "74123456789055",
      authorizationCodeDueOn: "2026-10-18",
    });
    expect(addJob).not.toHaveBeenCalled();
  });

  it("opens a task for a person and never asks again when ARCA rejects the credit note", async () => {
    await issueWsaaToken();
    const creditNoteId = await aCreditNote();
    server.behave(
      answersInTurn(
        "fe-comp-ultimo-autorizado-credit-note.xml",
        "fe-cae-solicitar-credit-note-rejected.xml",
      ),
    );
    const { task } = taskUnderTest();
    const { helpers, addJob } = buildJobHelpers();

    await task({ creditNoteId }, helpers);

    expect(await storedRow(creditNoteId)).toMatchObject({ answerKind: "rejected", number: 5 });
    const tasks = await testDatabase.db.select().from(fiscalTasks);
    expect(tasks).toMatchObject([
      {
        kind: "credit_note_rejected",
        documentType: "credit_note_c",
        pointOfSale: 7,
        number: 5,
        state: "open",
      },
    ]);
    expect(addJob).not.toHaveBeenCalled();
  });

  it("asks again once the request settles when ARCA gives no answer to the credit note", async () => {
    await issueWsaaToken();
    const creditNoteId = await aCreditNote();
    server.behave(
      answersInTurn("fe-comp-ultimo-autorizado-credit-note.xml", "fe-cae-solicitar-empty.xml"),
    );
    const { task } = taskUnderTest();
    const { helpers, addJob } = buildJobHelpers();

    await task({ creditNoteId }, helpers);

    expect(await storedRow(creditNoteId)).toMatchObject({ answerKind: "unclear", number: 5 });
    expect(addJob.mock.calls).toEqual([
      [
        ORPHAN_CREDIT_NOTE_TASK_IDENTIFIER,
        { creditNoteId },
        {
          jobKey: `${ORPHAN_CREDIT_NOTE_TASK_IDENTIFIER}:${creditNoteId}`,
          jobKeyMode: "replace",
          priority: -20,
          runAt: new Date(NOW.getTime() + 60_000),
        },
      ],
    ]);
  });

  it("asks again later, requesting nothing, when ARCA does not say which credit note it authorized last", async () => {
    await issueWsaaToken();
    const creditNoteId = await aCreditNote();
    server.behave(answersInTurn("fe-comp-ultimo-autorizado-token-error.xml"));
    const { task } = taskUnderTest();
    const { helpers, addJob } = buildJobHelpers();

    await task({ creditNoteId }, helpers);

    expect(server.requests).toHaveLength(1);
    expect(await storedRow(creditNoteId)).toMatchObject({ number: null });
    expect(addJob.mock.calls).toMatchObject([
      [
        ORPHAN_CREDIT_NOTE_TASK_IDENTIFIER,
        { creditNoteId },
        { runAt: new Date(NOW.getTime() + 30_000) },
      ],
    ]);
  });

  it("ends without asking ARCA anything for a credit note already authorized or unknown", async () => {
    await issueWsaaToken();
    const authorized = await aCreditNote({
      number: 5,
      issuedOn: ISSUE_DAY,
      requestedAt: CREATED_AT,
      answerKind: "authorized",
      answeredAt: CREATED_AT,
      authorizationCode: "74123456789055",
      authorizationCodeDueOn: "2026-10-18",
    });
    const { task } = taskUnderTest();
    const { helpers, addJob } = buildJobHelpers();

    await task({ creditNoteId: authorized }, helpers);
    await task({ creditNoteId: crypto.randomUUID() }, helpers);

    expect(server.requests).toEqual([]);
    expect(addJob).not.toHaveBeenCalled();
  });

  it.each([{}, { creditNoteId: 7 }, { creditNoteId: "" }, null])(
    "fails a job whose payload names no credit note (%j), asking ARCA nothing",
    async (payload) => {
      const { task } = taskUnderTest();

      await expect(task(payload, buildJobHelpers().helpers)).rejects.toThrow();

      expect(server.requests).toEqual([]);
    },
  );
});
