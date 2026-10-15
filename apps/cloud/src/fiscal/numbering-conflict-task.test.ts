import { FICTIONAL_CERTIFICATE_CUIT } from "@purosur/domain/fiscal/test-support";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  alerts,
  arcaWsaaTokens,
  fiscalRequests,
  numberingFreezes,
  taxAuthorityLastAuthorizedNumbers,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { buildJobHelpers } from "../test-support/job-helpers.js";
import {
  DIAGNOSE_NUMBERING_CONFLICT_TASK_IDENTIFIER,
  numberingConflictJobs,
  RECONCILE_NUMBERING_CONFLICT_TASK_IDENTIFIER,
} from "./numbering-conflict-task.js";
import {
  authorizationRequestRecord,
  insertRegisterWithPointOfSale,
} from "./test-support/authorization-request-fixtures.js";
import {
  answersInTurn,
  type FakeWsfeServer,
  startFakeWsfeServer,
} from "./test-support/fake-wsfe-server.js";
import { WsfeTaxAuthorityLastAuthorized } from "./wsfe-tax-authority-last-authorized.js";
import { WsfeTaxAuthorityVouchers } from "./wsfe-tax-authority-vouchers.js";

const ANSWERED_AT = new Date("2026-10-06T15:00:02.000Z");
const NOW = new Date(ANSWERED_AT.getTime() + 61_000);
const FINGERPRINT = "AB:CD:EF";
const FROZEN_AT = new Date("2026-10-06T15:00:00.000Z");

let testDatabase: TestDatabase;
let server: FakeWsfeServer;
let reconciliationsRequested: number[];

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
  reconciliationsRequested = [];
});

function tasksUnderTest() {
  const jobs = numberingConflictJobs({
    now: () => NOW,
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
    enqueueNumberingReconciliation: async (_, pointOfSale) => {
      reconciliationsRequested.push(pointOfSale);
    },
  });
  const diagnose = jobs.taskList[DIAGNOSE_NUMBERING_CONFLICT_TASK_IDENTIFIER];
  const reconcile = jobs.taskList[RECONCILE_NUMBERING_CONFLICT_TASK_IDENTIFIER];
  if (!diagnose || !reconcile) {
    throw new Error("test setup: expected the registered numbering conflict tasks");
  }
  return { jobs, diagnose, reconcile };
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

async function registerOfPointOfSale() {
  return insertRegisterWithPointOfSale(testDatabase.db, {
    pointOfSaleNumber: 7,
    name: "caja-1",
  });
}

async function recordRequest(
  registerId: string,
  number: number,
  columns: Partial<typeof fiscalRequests.$inferInsert> = {},
) {
  const request = authorizationRequestRecord(registerId, { number });
  await testDatabase.db.insert(fiscalRequests).values({ ...request, ...columns });
  return request.fiscalDocumentId;
}

function numberingConflict(number: number, issuedOn = "2026-10-06") {
  return {
    issuedOn,
    number,
    answerKind: "unclear",
    unclearCodes: [10016],
    answeredAt: ANSWERED_AT,
  };
}

async function storedDiagnosis(fiscalDocumentId: string) {
  const [row] = await testDatabase.db
    .select({ diagnosis: fiscalRequests.diagnosis, diagnosedAt: fiscalRequests.diagnosedAt })
    .from(fiscalRequests)
    .where(eq(fiscalRequests.fiscalDocumentId, fiscalDocumentId));
  return row;
}

async function freezes() {
  return testDatabase.db.select().from(numberingFreezes);
}

describe("numberingConflictJobs", () => {
  it("registers the tasks that diagnose a numbering conflict and reconcile a frozen point of sale, and schedules nothing", () => {
    const { jobs } = tasksUnderTest();

    expect(Object.keys(jobs.taskList).sort()).toEqual([
      DIAGNOSE_NUMBERING_CONFLICT_TASK_IDENTIFIER,
      RECONCILE_NUMBERING_CONFLICT_TASK_IDENTIFIER,
    ]);
    expect(jobs.crontab).toEqual([]);
  });

  describe("the diagnosis", () => {
    it("records a collision, freezes the point of sale at the count it held and asks for its reconciliation", async () => {
      await issueWsaaToken();
      const registerId = await registerOfPointOfSale();
      const fiscalDocumentId = await recordRequest(registerId, 40, numberingConflict(40));
      await testDatabase.db
        .insert(taxAuthorityLastAuthorizedNumbers)
        .values({ pointOfSaleNumber: 7, lastAuthorized: 12, readAt: FROZEN_AT });
      server.behave(answersInTurn("fe-comp-ultimo-autorizado.xml", "fe-comp-consultar-found.xml"));
      const { diagnose } = tasksUnderTest();
      const { helpers, addJob } = buildJobHelpers();

      await diagnose({ fiscalDocumentId }, helpers);

      expect(await storedDiagnosis(fiscalDocumentId)).toEqual({
        diagnosis: "collision",
        diagnosedAt: NOW,
      });
      expect(await freezes()).toEqual([
        { pointOfSaleNumber: 7, countBeforeFreeze: 12, frozenAt: NOW },
      ]);
      expect(reconciliationsRequested).toEqual([7]);
      expect(addJob).not.toHaveBeenCalled();
    });

    it("records a date behind and freezes nothing", async () => {
      await issueWsaaToken();
      const registerId = await registerOfPointOfSale();
      const fiscalDocumentId = await recordRequest(
        registerId,
        2,
        numberingConflict(2, "2026-10-05"),
      );
      server.behave(answersInTurn("fe-comp-ultimo-autorizado.xml", "fe-comp-consultar-found.xml"));
      const { diagnose } = tasksUnderTest();

      await diagnose({ fiscalDocumentId }, buildJobHelpers().helpers);

      expect((await storedDiagnosis(fiscalDocumentId))?.diagnosis).toBe("date_behind");
      expect(await freezes()).toEqual([]);
      expect(reconciliationsRequested).toEqual([]);
    });

    it("fails the job, for the worker to run it again, while ARCA gives no answer", async () => {
      await issueWsaaToken();
      const registerId = await registerOfPointOfSale();
      const fiscalDocumentId = await recordRequest(registerId, 40, numberingConflict(40));
      server.behave(answersInTurn("fe-comp-ultimo-autorizado-token-error.xml"));
      const { diagnose } = tasksUnderTest();

      await expect(diagnose({ fiscalDocumentId }, buildJobHelpers().helpers)).rejects.toThrow();

      expect((await storedDiagnosis(fiscalDocumentId))?.diagnosis).toBeNull();
      expect(await freezes()).toEqual([]);
    });

    it("ends without asking ARCA anything for a document that is unknown or was not left unclear by the numbering conflict", async () => {
      await issueWsaaToken();
      const registerId = await registerOfPointOfSale();
      const other = await recordRequest(registerId, 41, {
        answerKind: "unclear",
        unclearCodes: [],
        answeredAt: ANSWERED_AT,
      });
      const { diagnose } = tasksUnderTest();
      const { helpers } = buildJobHelpers();

      await diagnose({ fiscalDocumentId: other }, helpers);
      await diagnose({ fiscalDocumentId: crypto.randomUUID() }, helpers);

      expect(server.requests).toEqual([]);
    });

    it.each([{}, { fiscalDocumentId: 7 }, { fiscalDocumentId: "" }, null])(
      "fails a job whose payload names no document (%j)",
      async (payload) => {
        const { diagnose } = tasksUnderTest();

        await expect(diagnose(payload, buildJobHelpers().helpers)).rejects.toThrow();
      },
    );
  });

  describe("the reconciliation", () => {
    async function freeze(countBeforeFreeze: number) {
      await testDatabase.db
        .insert(numberingFreezes)
        .values({ pointOfSaleNumber: 7, countBeforeFreeze, frozenAt: FROZEN_AT });
      await testDatabase.db
        .insert(taxAuthorityLastAuthorizedNumbers)
        .values({ pointOfSaleNumber: 7, lastAuthorized: countBeforeFreeze, readAt: FROZEN_AT });
    }

    it("opens an alert for each number ARCA authorized without an own document, continues the series after the last and lifts the freeze", async () => {
      await issueWsaaToken();
      const registerId = await registerOfPointOfSale();
      await freeze(1);
      await recordRequest(registerId, 2, {
        answerKind: "authorized",
        authorizationCode: "74123456789012",
        authorizationCodeDueOn: "2026-10-16",
        answeredAt: ANSWERED_AT,
      });
      server.behave(answersInTurn("fe-comp-ultimo-autorizado-advanced.xml"));
      const { reconcile } = tasksUnderTest();

      await reconcile({ pointOfSale: 7 }, buildJobHelpers().helpers);

      expect(
        (await testDatabase.db.select().from(alerts))
          .filter((alert) => alert.kind === "external_billing")
          .map((alert) => alert.detail),
      ).toEqual([{ pointOfSale: 7, documentType: "factura_c", number: 3 }]);
      expect(await testDatabase.db.select().from(taxAuthorityLastAuthorizedNumbers)).toEqual([
        { pointOfSaleNumber: 7, lastAuthorized: 3, readAt: NOW },
      ]);
      expect(await freezes()).toEqual([]);
    });

    it("fails the job, for the worker to run it again, while a document in the range is undecided", async () => {
      await issueWsaaToken();
      const registerId = await registerOfPointOfSale();
      await freeze(1);
      await recordRequest(registerId, 2, {
        answerKind: "unclear",
        unclearCodes: [],
        answeredAt: ANSWERED_AT,
      });
      server.behave(answersInTurn("fe-comp-ultimo-autorizado-advanced.xml"));
      const { reconcile } = tasksUnderTest();

      await expect(reconcile({ pointOfSale: 7 }, buildJobHelpers().helpers)).rejects.toThrow();

      expect(await freezes()).toHaveLength(1);
    });

    it("fails the job, for the worker to run it again, while ARCA gives no answer", async () => {
      await issueWsaaToken();
      await registerOfPointOfSale();
      await freeze(1);
      server.behave(answersInTurn("fe-comp-ultimo-autorizado-token-error.xml"));
      const { reconcile } = tasksUnderTest();

      await expect(reconcile({ pointOfSale: 7 }, buildJobHelpers().helpers)).rejects.toThrow();

      expect(await freezes()).toHaveLength(1);
    });

    it("ends without asking ARCA anything for a point of sale that is not frozen", async () => {
      await issueWsaaToken();
      await registerOfPointOfSale();
      const { reconcile } = tasksUnderTest();

      await reconcile({ pointOfSale: 7 }, buildJobHelpers().helpers);

      expect(server.requests).toEqual([]);
    });

    it.each([{}, { pointOfSale: "7" }, { pointOfSale: 0 }, null])(
      "fails a job whose payload names no point of sale (%j)",
      async (payload) => {
        const { reconcile } = tasksUnderTest();

        await expect(reconcile(payload, buildJobHelpers().helpers)).rejects.toThrow();
      },
    );
  });
});
