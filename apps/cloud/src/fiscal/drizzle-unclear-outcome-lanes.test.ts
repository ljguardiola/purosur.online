import {
  FiscalDocumentAlreadyRecorded,
  type RealTimeAuthorizationAnswer,
} from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import type { PgliteQueryResultHKT } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fiscalRequests } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzlePointOfSaleLanes } from "./drizzle-point-of-sale-lanes.js";
import {
  DrizzleUnclearOutcomeLanes,
  DrizzleUnclearOutcomeRequests,
} from "./drizzle-unclear-outcome-lanes.js";
import {
  authorizationRequestRecord,
  insertRegisterWithPointOfSale,
  RECEIVED_AT,
} from "./test-support/authorization-request-fixtures.js";

const ANSWERED_AT = new Date("2026-10-06T15:00:02.000Z");
const ABANDONED_AT = new Date("2026-10-06T15:00:30.000Z");
const DECIDED_AT = new Date("2026-10-06T15:01:40.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let unclearLanes: DrizzleUnclearOutcomeLanes<PgliteQueryResultHKT>;
let requests: DrizzleUnclearOutcomeRequests<PgliteQueryResultHKT>;
let authorizationLanes: DrizzlePointOfSaleLanes<PgliteQueryResultHKT>;
let enqueued: string[];
let enqueueFailure: Error | undefined;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
  const connections = { withConnection: <T>(work: (db_: typeof db) => Promise<T>) => work(db) };
  unclearLanes = new DrizzleUnclearOutcomeLanes(connections, async (_, id) => {
    if (enqueueFailure) {
      throw enqueueFailure;
    }
    enqueued.push(id);
  });
  requests = new DrizzleUnclearOutcomeRequests(db);
  authorizationLanes = new DrizzlePointOfSaleLanes(connections, async () => {});
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  enqueued = [];
  enqueueFailure = undefined;
});

async function recordedRequest(number = 42, answer?: RealTimeAuthorizationAnswer) {
  const registerId = await insertRegisterWithPointOfSale(db, {
    pointOfSaleNumber: 7,
    name: `caja-${number}`,
  });
  const request = authorizationRequestRecord(registerId, { number });
  await authorizationLanes.inPointOfSaleLane(7, async (lane) => {
    await lane.recordRequest(request);
    if (answer) {
      await lane.recordAnswer(request.fiscalDocumentId, answer, ANSWERED_AT);
    }
  });
  enqueued = [];
  return request;
}

async function storedRow(fiscalDocumentId: string) {
  const [row] = await db
    .select()
    .from(fiscalRequests)
    .where(eq(fiscalRequests.fiscalDocumentId, fiscalDocumentId));
  return row;
}

describe("DrizzleUnclearOutcomeRequests", () => {
  it("answers the point of sale of a recorded document", async () => {
    const request = await recordedRequest();

    expect(await requests.pointOfSaleOf(request.fiscalDocumentId)).toBe(7);
  });

  it("answers null for a document the cloud has no record of", async () => {
    expect(await requests.pointOfSaleOf(crypto.randomUUID())).toBeNull();
  });
});

describe("DrizzleUnclearOutcomeLanes", () => {
  describe("the request of a document", () => {
    it("is unknown when the cloud has no record of it", async () => {
      const found = await unclearLanes.inPointOfSaleLane(7, (lane) =>
        lane.unclearRequest(crypto.randomUUID()),
      );

      expect(found).toBeNull();
    });

    it("carries the data of the document and no answer while the request waits for one", async () => {
      const request = await recordedRequest();

      const found = await unclearLanes.inPointOfSaleLane(7, (lane) =>
        lane.unclearRequest(request.fiscalDocumentId),
      );

      expect(found).toEqual({
        fiscalDocumentId: request.fiscalDocumentId,
        pointOfSale: 7,
        number: 42,
        issuedOn: "2026-10-06",
        total: 1500,
        buyerTaxStatusCode: 5,
        progress: { kind: "no_answer" },
        decision: null,
      });
    });

    it.each<[string, RealTimeAuthorizationAnswer]>([
      ["unclear", { kind: "unclear" }],
      ["not attempted", { kind: "not_attempted" }],
      [
        "authorized",
        {
          kind: "authorized",
          authorizationCode: "74123456789012",
          authorizationCodeDueOn: "2026-10-16",
        },
      ],
    ])("carries the answer %s and the time it was given", async (_name, answer) => {
      const request = await recordedRequest(42, answer);

      const found = await unclearLanes.inPointOfSaleLane(7, (lane) =>
        lane.unclearRequest(request.fiscalDocumentId),
      );

      expect(found?.progress).toEqual({ kind: "answered", answer, answeredAt: ANSWERED_AT });
    });
  });

  describe("the abandonment of a request with no answer", () => {
    it("records the request as unclear, answered when it was abandoned", async () => {
      const request = await recordedRequest();

      await unclearLanes.inPointOfSaleLane(7, (lane) =>
        lane.recordAbandonment(request.fiscalDocumentId, ABANDONED_AT),
      );

      expect(await storedRow(request.fiscalDocumentId)).toMatchObject({
        answerKind: "unclear",
        answeredAt: ABANDONED_AT,
        decision: null,
      });
      const found = await unclearLanes.inPointOfSaleLane(7, (lane) =>
        lane.unclearRequest(request.fiscalDocumentId),
      );
      expect(found?.progress).toEqual({
        kind: "answered",
        answer: { kind: "unclear" },
        answeredAt: ABANDONED_AT,
      });
    });
  });

  describe("the decision", () => {
    it("records a release with the time it was decided", async () => {
      const request = await recordedRequest(42, { kind: "unclear" });

      await unclearLanes.inPointOfSaleLane(7, (lane) =>
        lane.recordDecision(request.fiscalDocumentId, { kind: "released" }, DECIDED_AT),
      );

      expect(await storedRow(request.fiscalDocumentId)).toMatchObject({
        decision: "released",
        decidedAt: DECIDED_AT,
        adoptedAuthorizationCode: null,
        adoptedAuthorizationCodeDueOn: null,
      });
    });

    it("records an adoption with the authorization code and its due date", async () => {
      const request = await recordedRequest(42, { kind: "unclear" });

      await unclearLanes.inPointOfSaleLane(7, (lane) =>
        lane.recordDecision(
          request.fiscalDocumentId,
          {
            kind: "adopted",
            authorizationCode: "74123456789012",
            authorizationCodeDueOn: "2026-10-16",
          },
          DECIDED_AT,
        ),
      );

      expect(await storedRow(request.fiscalDocumentId)).toMatchObject({
        decision: "adopted",
        decidedAt: DECIDED_AT,
        adoptedAuthorizationCode: "74123456789012",
        adoptedAuthorizationCodeDueOn: "2026-10-16",
      });
    });

    it("records a conflict", async () => {
      const request = await recordedRequest(42, { kind: "unclear" });

      await unclearLanes.inPointOfSaleLane(7, (lane) =>
        lane.recordDecision(request.fiscalDocumentId, { kind: "conflicting" }, DECIDED_AT),
      );

      expect(await storedRow(request.fiscalDocumentId)).toMatchObject({
        decision: "conflicting",
        decidedAt: DECIDED_AT,
      });
    });

    it.each([
      [{ kind: "released" }],
      [
        {
          kind: "adopted",
          authorizationCode: "74123456789012",
          authorizationCodeDueOn: "2026-10-16",
        },
      ],
      [{ kind: "conflicting" }],
    ] as const)("is read back with the request as %j", async (decision) => {
      const request = await recordedRequest(42, { kind: "unclear" });

      const found = await unclearLanes.inPointOfSaleLane(7, async (lane) => {
        await lane.recordDecision(request.fiscalDocumentId, decision, DECIDED_AT);
        return lane.unclearRequest(request.fiscalDocumentId);
      });

      expect(found?.decision).toEqual(decision);
    });

    it("is refused for a document that was authorized", async () => {
      const request = await recordedRequest(42, {
        kind: "authorized",
        authorizationCode: "74123456789012",
        authorizationCodeDueOn: "2026-10-16",
      });

      await expect(
        unclearLanes.inPointOfSaleLane(7, (lane) =>
          lane.recordDecision(request.fiscalDocumentId, { kind: "released" }, DECIDED_AT),
        ),
      ).rejects.toThrow();
    });
  });

  describe("which register owns a point of sale", () => {
    it("is the register the point of sale is configured on, and no other", async () => {
      const registerId = await insertRegisterWithPointOfSale(db, {
        pointOfSaleNumber: 7,
        name: "caja-1",
      });
      const otherRegisterId = await insertRegisterWithPointOfSale(db, {
        pointOfSaleNumber: 8,
        name: "caja-2",
      });

      const answers = await unclearLanes.inPointOfSaleLane(7, async (lane) => [
        await lane.registerOwnsPointOfSale(registerId, 7),
        await lane.registerOwnsPointOfSale(otherRegisterId, 7),
        await lane.registerOwnsPointOfSale(registerId, 8),
      ]);

      expect(answers).toEqual([true, false, false]);
    });
  });

  describe("the request a register recorded", () => {
    it("is unknown for a document nobody recorded and for another register's document", async () => {
      const request = await recordedRequest();
      const otherRegisterId = await insertRegisterWithPointOfSale(db, {
        pointOfSaleNumber: 8,
        name: "caja-otra",
      });

      const answers = await unclearLanes.inPointOfSaleLane(7, async (lane) => [
        await lane.recordedRequest(request.registerId, crypto.randomUUID()),
        await lane.recordedRequest(otherRegisterId, request.fiscalDocumentId),
      ]);

      expect(answers).toEqual([null, null]);
    });

    it("carries no decision until one is recorded, then the decision", async () => {
      const request = await recordedRequest(42, { kind: "unclear" });

      const recorded = await unclearLanes.inPointOfSaleLane(7, async (lane) => {
        const before = await lane.recordedRequest(request.registerId, request.fiscalDocumentId);
        await lane.recordDecision(request.fiscalDocumentId, { kind: "released" }, DECIDED_AT);
        const after = await lane.recordedRequest(request.registerId, request.fiscalDocumentId);
        return [before, after];
      });

      expect(recorded).toEqual([{ decision: null }, { decision: { kind: "released" } }]);
    });
  });

  describe("a document the cloud has no record of", () => {
    async function abandonedRecord(registerId: string) {
      const {
        notAfter: _notAfter,
        receivedAt: _receivedAt,
        ...record
      } = authorizationRequestRecord(registerId, { number: 90 });
      return record;
    }

    it("is recorded as unclear, answered, received and expired when it was abandoned, with its sale event", async () => {
      const registerId = await insertRegisterWithPointOfSale(db, {
        pointOfSaleNumber: 7,
        name: "caja-1",
      });
      const record = await abandonedRecord(registerId);

      await unclearLanes.inPointOfSaleLane(7, (lane) =>
        lane.recordAbandonedRequest(record, ABANDONED_AT),
      );

      expect(await storedRow(record.fiscalDocumentId)).toMatchObject({
        registerId,
        saleId: record.saleId,
        pointOfSale: 7,
        number: 90,
        issuedOn: "2026-10-06",
        total: 1500,
        buyerTaxStatusCode: 5,
        saleEvent: record.saleEvent,
        receivedAt: ABANDONED_AT,
        notAfter: ABANDONED_AT,
        answerKind: "unclear",
        answeredAt: ABANDONED_AT,
        decision: null,
      });
    });

    it("enqueues its decision in the transaction that records it", async () => {
      const registerId = await insertRegisterWithPointOfSale(db, {
        pointOfSaleNumber: 7,
        name: "caja-1",
      });
      const record = await abandonedRecord(registerId);

      await unclearLanes.inPointOfSaleLane(7, (lane) =>
        lane.recordAbandonedRequest(record, ABANDONED_AT),
      );

      expect(enqueued).toEqual([record.fiscalDocumentId]);
    });

    it("is not recorded when enqueueing its decision fails", async () => {
      const registerId = await insertRegisterWithPointOfSale(db, {
        pointOfSaleNumber: 7,
        name: "caja-1",
      });
      const record = await abandonedRecord(registerId);
      enqueueFailure = new Error("the queue is down");

      await expect(
        unclearLanes.inPointOfSaleLane(7, (lane) =>
          lane.recordAbandonedRequest(record, ABANDONED_AT),
        ),
      ).rejects.toThrow("the queue is down");

      expect(await storedRow(record.fiscalDocumentId)).toBeUndefined();
    });

    it("is refused when another register already recorded that document id, leaving that request as it was", async () => {
      const first = await recordedRequest(42, { kind: "unclear" });
      const otherRegisterId = await insertRegisterWithPointOfSale(db, {
        pointOfSaleNumber: 8,
        name: "caja-otra",
      });
      const { notAfter: _notAfter, receivedAt: _receivedAt, ...record } = first;

      await expect(
        unclearLanes.inPointOfSaleLane(8, (lane) =>
          lane.recordAbandonedRequest(
            { ...record, registerId: otherRegisterId, pointOfSale: 8 },
            ABANDONED_AT,
          ),
        ),
      ).rejects.toBeInstanceOf(FiscalDocumentAlreadyRecorded);

      expect(await storedRow(first.fiscalDocumentId)).toMatchObject({
        registerId: first.registerId,
        receivedAt: RECEIVED_AT,
      });
      expect(enqueued).toEqual([]);
    });
  });

  it("returns what the work returns and does not swallow what it throws", async () => {
    expect(await unclearLanes.inPointOfSaleLane(7, async () => "done")).toBe("done");
    await expect(
      unclearLanes.inPointOfSaleLane(7, async () => {
        throw new Error("the work broke");
      }),
    ).rejects.toThrow("the work broke");
  });
});
