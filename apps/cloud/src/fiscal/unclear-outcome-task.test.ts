import { FICTIONAL_CERTIFICATE_CUIT } from "@purosur/domain/fiscal/test-support";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { arcaWsaaTokens, fiscalRequests } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { buildJobHelpers } from "../test-support/job-helpers.js";
import {
  authorizationRequestRecord,
  insertRegisterWithPointOfSale,
} from "./test-support/authorization-request-fixtures.js";
import {
  answers,
  answersInTurn,
  type FakeWsfeServer,
  startFakeWsfeServer,
  UNREACHABLE_WSFE_ENDPOINT,
} from "./test-support/fake-wsfe-server.js";
import { UNCLEAR_OUTCOME_TASK_IDENTIFIER, unclearOutcomeJobs } from "./unclear-outcome-task.js";
import { WsfeTaxAuthorityLastAuthorized } from "./wsfe-tax-authority-last-authorized.js";
import { WsfeTaxAuthorityVouchers } from "./wsfe-tax-authority-vouchers.js";

const ANSWERED_AT = new Date("2026-10-06T15:00:02.000Z");
const SETTLED_NOW = new Date(ANSWERED_AT.getTime() + 61_000);
const FINGERPRINT = "AB:CD:EF";

let testDatabase: TestDatabase;
let server: FakeWsfeServer;
let now: Date;

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
});

function taskUnderTest(vouchersEndpoint = server.endpoint) {
  const jobs = unclearOutcomeJobs({
    now: () => now,
    vouchers: new WsfeTaxAuthorityVouchers({
      endpoint: vouchersEndpoint,
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
  return recordRequest({ answerKind: "unclear", answeredAt: ANSWERED_AT, ...columns });
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

  it("releases the number when ARCA holds no voucher at it and has authorized fewer", async () => {
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

  it("adopts the voucher ARCA holds when it matches the document", async () => {
    await issueWsaaToken();
    const fiscalDocumentId = await unclearRequest();
    server.behave(answers("fe-comp-consultar-found.xml"));
    const { task } = taskUnderTest();
    const { helpers, addJob } = buildJobHelpers();

    await task({ fiscalDocumentId }, helpers);

    expect(await storedRow(fiscalDocumentId)).toMatchObject({
      decision: "adopted",
      decidedAt: SETTLED_NOW,
      adoptedAuthorizationCode: "74123456789012",
      adoptedAuthorizationCodeDueOn: "2026-10-16",
    });
    expect(addJob).not.toHaveBeenCalled();
  });

  it("records a conflict when the voucher ARCA holds differs from the document", async () => {
    await issueWsaaToken();
    const fiscalDocumentId = await unclearRequest({ total: 2000 });
    server.behave(answers("fe-comp-consultar-found.xml"));
    const { task } = taskUnderTest();
    const { helpers, addJob } = buildJobHelpers();

    await task({ fiscalDocumentId }, helpers);

    expect(await storedRow(fiscalDocumentId)).toMatchObject({
      decision: "conflicting",
      adoptedAuthorizationCode: null,
    });
    expect(addJob).not.toHaveBeenCalled();
  });

  it("asks again at the fixed interval, deciding nothing, when ARCA has authorized the number or more without holding a voucher", async () => {
    await issueWsaaToken();
    const fiscalDocumentId = await unclearRequest({ number: 1 });
    server.behave(
      answersInTurn("fe-comp-consultar-not-found.xml", "fe-comp-ultimo-autorizado.xml"),
    );
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
          runAt: new Date(SETTLED_NOW.getTime() + 30_000),
        },
      },
    ]);
  });

  it.each([
    ["cannot be reached", UNREACHABLE_WSFE_ENDPOINT],
    ["refuses the lookup", undefined],
  ])("asks again, deciding nothing, when ARCA %s", async (_case, vouchersEndpoint) => {
    await issueWsaaToken();
    const fiscalDocumentId = await unclearRequest();
    server.behave(answers("fe-comp-consultar-token-error.xml"));
    const { task } = taskUnderTest(vouchersEndpoint);
    const { helpers, addJob } = buildJobHelpers();

    await task({ fiscalDocumentId }, helpers);

    expect((await storedRow(fiscalDocumentId))?.decision).toBeNull();
    expect(requeuedAt(addJob)).toMatchObject([
      { spec: { runAt: new Date(SETTLED_NOW.getTime() + 30_000) } },
    ]);
  });

  it("asks again, deciding nothing, when the cloud holds no valid WSAA token", async () => {
    const fiscalDocumentId = await unclearRequest();
    const { task } = taskUnderTest();
    const { helpers, addJob } = buildJobHelpers();

    await task({ fiscalDocumentId }, helpers);

    expect(server.requests).toEqual([]);
    expect((await storedRow(fiscalDocumentId))?.decision).toBeNull();
    expect(addJob).toHaveBeenCalledTimes(1);
  });

  it("asks ARCA nothing until the outcome has settled, and comes back when it does", async () => {
    await issueWsaaToken();
    const fiscalDocumentId = await unclearRequest();
    now = new Date(ANSWERED_AT.getTime() + 10_000);
    const { task } = taskUnderTest();
    const { helpers, addJob } = buildJobHelpers();

    await task({ fiscalDocumentId }, helpers);

    expect(server.requests).toEqual([]);
    expect(requeuedAt(addJob)).toMatchObject([
      { spec: { runAt: new Date(ANSWERED_AT.getTime() + 60_000) } },
    ]);
  });

  it("abandons a request that still has no answer, then waits for the outcome to settle", async () => {
    await issueWsaaToken();
    const fiscalDocumentId = await recordRequest();
    const { task } = taskUnderTest();
    const { helpers, addJob } = buildJobHelpers();

    await task({ fiscalDocumentId }, helpers);

    expect(await storedRow(fiscalDocumentId)).toMatchObject({
      answerKind: "unclear",
      answeredAt: SETTLED_NOW,
      decision: null,
    });
    expect(server.requests).toEqual([]);
    expect(requeuedAt(addJob)).toMatchObject([
      { spec: { runAt: new Date(SETTLED_NOW.getTime() + 60_000) } },
    ]);
  });

  it("releases at once a document the cloud never attempted", async () => {
    const fiscalDocumentId = await recordRequest({
      answerKind: "not_attempted",
      answeredAt: ANSWERED_AT,
    });
    now = new Date(ANSWERED_AT.getTime() + 1_000);
    const { task } = taskUnderTest();
    const { helpers, addJob } = buildJobHelpers();

    await task({ fiscalDocumentId }, helpers);

    expect((await storedRow(fiscalDocumentId))?.decision).toBe("released");
    expect(server.requests).toEqual([]);
    expect(addJob).not.toHaveBeenCalled();
  });

  it("ends without asking ARCA when the document was authorized, was decided already, or is unknown", async () => {
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

  it("ends without asking ARCA when the document was decided already", async () => {
    await issueWsaaToken();
    const fiscalDocumentId = await unclearRequest({ decision: "released", decidedAt: ANSWERED_AT });
    const { task } = taskUnderTest();
    const { helpers, addJob } = buildJobHelpers();

    await task({ fiscalDocumentId }, helpers);

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
