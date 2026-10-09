import {
  FiscalDocumentAlreadyRecorded,
  type RealTimeAuthorizationAnswer,
} from "@purosur/domain/fiscal/use-cases";
import { eq, sql } from "drizzle-orm";
import type { PgliteQueryResultHKT } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { arcaInvoicingEvidence, fiscalRequests } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzlePointOfSaleLanes } from "./drizzle-point-of-sale-lanes.js";
import {
  authorizationRequestRecord,
  insertRegisterWithPointOfSale,
  RECEIVED_AT,
} from "./test-support/authorization-request-fixtures.js";

const ANSWERED_AT = new Date("2026-10-06T15:00:02.000Z");
const LATER_ANSWERED_AT = new Date("2026-10-06T15:00:30.000Z");
const AUTHORIZED: RealTimeAuthorizationAnswer = {
  kind: "authorized",
  authorizationCode: "74123456789012",
  authorizationCodeDueOn: "2026-10-16",
};

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let lanes: DrizzlePointOfSaleLanes<PgliteQueryResultHKT>;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
  lanes = new DrizzlePointOfSaleLanes({ withConnection: (work) => work(db) });
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

async function invoicingEvidenceTimes() {
  const rows = await db.select().from(arcaInvoicingEvidence);
  return rows.map((row) => row.lastCallOkAt);
}

async function recordedAnswerKind(fiscalDocumentId: string) {
  const [row] = await db
    .select({ answerKind: fiscalRequests.answerKind, answeredAt: fiscalRequests.answeredAt })
    .from(fiscalRequests)
    .where(eq(fiscalRequests.fiscalDocumentId, fiscalDocumentId));
  return row;
}

async function withFailingInvoicingEvidence(work: () => Promise<void>) {
  await db.execute(sql`
    create function refuse_invoicing_evidence() returns trigger language plpgsql as $$
    begin
      raise exception 'the evidence write broke';
    end;
    $$`);
  await db.execute(sql`
    create trigger refuse_invoicing_evidence before insert on arca_invoicing_evidence
    for each row execute function refuse_invoicing_evidence()`);
  try {
    await work();
  } finally {
    await db.execute(sql`drop trigger refuse_invoicing_evidence on arca_invoicing_evidence`);
    await db.execute(sql`drop function refuse_invoicing_evidence()`);
  }
}

describe("DrizzlePointOfSaleLanes", () => {
  describe("which register owns a point of sale", () => {
    it("is the register the point of sale is configured on", async () => {
      const registerId = await insertRegisterWithPointOfSale(db, {
        pointOfSaleNumber: 7,
        name: "caja-1",
      });

      const owns = await lanes.inPointOfSaleLane(7, (lane) =>
        lane.registerOwnsPointOfSale(registerId, 7),
      );

      expect(owns).toBe(true);
    });

    it("is not another register, nor a number the register is not configured with", async () => {
      const registerId = await insertRegisterWithPointOfSale(db, {
        pointOfSaleNumber: 7,
        name: "caja-1",
      });
      const otherRegisterId = await insertRegisterWithPointOfSale(db, {
        pointOfSaleNumber: 8,
        name: "caja-2",
      });

      const answers = await lanes.inPointOfSaleLane(7, async (lane) => [
        await lane.registerOwnsPointOfSale(otherRegisterId, 7),
        await lane.registerOwnsPointOfSale(registerId, 8),
      ]);

      expect(answers).toEqual([false, false]);
    });
  });

  describe("the recorded requests", () => {
    it("knows no request that was never recorded", async () => {
      const recorded = await lanes.inPointOfSaleLane(7, (lane) =>
        lane.recordedRequest(crypto.randomUUID(), crypto.randomUUID()),
      );

      expect(recorded).toBeNull();
    });

    it("keeps a request with every field and the sale event it carries, still waiting for its answer", async () => {
      const registerId = await insertRegisterWithPointOfSale(db, {
        pointOfSaleNumber: 7,
        name: "caja-1",
      });
      const request = authorizationRequestRecord(registerId);

      const recorded = await lanes.inPointOfSaleLane(7, async (lane) => {
        await lane.recordRequest(request);
        return lane.recordedRequest(registerId, request.fiscalDocumentId);
      });

      expect(recorded).toEqual({ answer: null });
      const [row] = await db
        .select()
        .from(fiscalRequests)
        .where(eq(fiscalRequests.fiscalDocumentId, request.fiscalDocumentId));
      expect(row).toEqual({
        fiscalDocumentId: request.fiscalDocumentId,
        registerId,
        saleId: request.saleId,
        pointOfSale: 7,
        number: 42,
        issuedOn: "2026-10-06",
        total: 1500,
        buyerTaxStatusCode: 5,
        saleEvent: request.saleEvent,
        receivedAt: RECEIVED_AT,
        notAfter: request.notAfter,
        answerKind: null,
        authorizationCode: null,
        authorizationCodeDueOn: null,
        rejectionCodes: null,
        answeredAt: null,
      });
    });

    it("finds no request another register recorded", async () => {
      const registerId = await insertRegisterWithPointOfSale(db, {
        pointOfSaleNumber: 7,
        name: "caja-1",
      });
      const otherRegisterId = await insertRegisterWithPointOfSale(db, {
        pointOfSaleNumber: 8,
        name: "caja-2",
      });
      const request = authorizationRequestRecord(registerId);

      const recorded = await lanes.inPointOfSaleLane(7, async (lane) => {
        await lane.recordRequest(request);
        await lane.recordAnswer(request.fiscalDocumentId, { kind: "unclear" }, ANSWERED_AT);
        return lane.recordedRequest(otherRegisterId, request.fiscalDocumentId);
      });

      expect(recorded).toBeNull();
    });

    it("refuses to record a document id already recorded, leaving the first request as it was", async () => {
      const registerId = await insertRegisterWithPointOfSale(db, {
        pointOfSaleNumber: 7,
        name: "caja-1",
      });
      const otherRegisterId = await insertRegisterWithPointOfSale(db, {
        pointOfSaleNumber: 8,
        name: "caja-2",
      });
      const request = authorizationRequestRecord(registerId);
      await lanes.inPointOfSaleLane(7, (lane) => lane.recordRequest(request));

      const recording = lanes.inPointOfSaleLane(8, (lane) =>
        lane.recordRequest({ ...request, registerId: otherRegisterId, pointOfSale: 8 }),
      );

      await expect(recording).rejects.toBeInstanceOf(FiscalDocumentAlreadyRecorded);
      expect(
        await db
          .select({ registerId: fiscalRequests.registerId })
          .from(fiscalRequests)
          .where(eq(fiscalRequests.fiscalDocumentId, request.fiscalDocumentId)),
      ).toEqual([{ registerId }]);
    });

    it.each<[string, RealTimeAuthorizationAnswer]>([
      [
        "authorized",
        {
          kind: "authorized",
          authorizationCode: "74123456789012",
          authorizationCodeDueOn: "2026-10-16",
        },
      ],
      ["rejected", { kind: "rejected", codes: [10015, 10048] }],
      ["not attempted", { kind: "not_attempted" }],
      ["unclear", { kind: "unclear" }],
    ])(
      "gives back the %s answer recorded for a request, with the time it was answered",
      async (_name, answer) => {
        const registerId = await insertRegisterWithPointOfSale(db, {
          pointOfSaleNumber: 7,
          name: "caja-1",
        });
        const request = authorizationRequestRecord(registerId);

        const recorded = await lanes.inPointOfSaleLane(7, async (lane) => {
          await lane.recordRequest(request);
          await lane.recordAnswer(request.fiscalDocumentId, answer, ANSWERED_AT);
          return lane.recordedRequest(registerId, request.fiscalDocumentId);
        });

        expect(recorded).toEqual({ answer });
        const [row] = await db
          .select({ answeredAt: fiscalRequests.answeredAt })
          .from(fiscalRequests)
          .where(eq(fiscalRequests.fiscalDocumentId, request.fiscalDocumentId));
        expect(row?.answeredAt).toEqual(ANSWERED_AT);
      },
    );
  });

  describe("the answer the tax authority gave", () => {
    it("is recorded together with the call as evidence the tax authority is reachable", async () => {
      const registerId = await insertRegisterWithPointOfSale(db, {
        pointOfSaleNumber: 7,
        name: "caja-1",
      });
      const request = authorizationRequestRecord(registerId);

      const recorded = await lanes.inPointOfSaleLane(7, async (lane) => {
        await lane.recordRequest(request);
        await lane.recordTaxAuthorityAnswer(request.fiscalDocumentId, AUTHORIZED, ANSWERED_AT);
        return lane.recordedRequest(registerId, request.fiscalDocumentId);
      });

      expect(recorded).toEqual({ answer: AUTHORIZED });
      expect(await recordedAnswerKind(request.fiscalDocumentId)).toEqual({
        answerKind: "authorized",
        answeredAt: ANSWERED_AT,
      });
      expect(await invoicingEvidenceTimes()).toEqual([ANSWERED_AT]);
    });

    it.each([
      ["a later answer moves the evidence forward", [ANSWERED_AT, LATER_ANSWERED_AT]],
      [
        "an earlier answer recorded last leaves the latest evidence",
        [LATER_ANSWERED_AT, ANSWERED_AT],
      ],
    ])("keeps only the latest evidence: %s", async (_name, answeredAts) => {
      const registerId = await insertRegisterWithPointOfSale(db, {
        pointOfSaleNumber: 7,
        name: "caja-1",
      });
      const answers = answeredAts.map((answeredAt, index) => ({
        request: authorizationRequestRecord(registerId, { number: 42 + index }),
        answeredAt,
      }));

      await lanes.inPointOfSaleLane(7, async (lane) => {
        for (const { request, answeredAt } of answers) {
          await lane.recordRequest(request);
          await lane.recordTaxAuthorityAnswer(request.fiscalDocumentId, AUTHORIZED, answeredAt);
        }
      });

      expect(await invoicingEvidenceTimes()).toEqual([LATER_ANSWERED_AT]);
    });

    it("leaves neither the answer nor the evidence when recording the evidence fails", async () => {
      const registerId = await insertRegisterWithPointOfSale(db, {
        pointOfSaleNumber: 7,
        name: "caja-1",
      });
      const request = authorizationRequestRecord(registerId);
      await lanes.inPointOfSaleLane(7, (lane) => lane.recordRequest(request));

      await withFailingInvoicingEvidence(async () => {
        const recording = lanes.inPointOfSaleLane(7, (lane) =>
          lane.recordTaxAuthorityAnswer(request.fiscalDocumentId, AUTHORIZED, ANSWERED_AT),
        );

        await expect(recording).rejects.toMatchObject({
          cause: { message: "the evidence write broke" },
        });
      });
      expect(await recordedAnswerKind(request.fiscalDocumentId)).toEqual({
        answerKind: null,
        answeredAt: null,
      });
      expect(await invoicingEvidenceTimes()).toEqual([]);
    });
  });

  it("records an answer the tax authority did not give without counting it as evidence", async () => {
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 7,
      name: "caja-1",
    });
    const request = authorizationRequestRecord(registerId);

    await lanes.inPointOfSaleLane(7, async (lane) => {
      await lane.recordRequest(request);
      await lane.recordAnswer(request.fiscalDocumentId, { kind: "unclear" }, ANSWERED_AT);
    });

    expect(await recordedAnswerKind(request.fiscalDocumentId)).toEqual({
      answerKind: "unclear",
      answeredAt: ANSWERED_AT,
    });
    expect(await invoicingEvidenceTimes()).toEqual([]);
  });

  it("returns what the work returns and does not swallow what it throws", async () => {
    await expect(lanes.inPointOfSaleLane(7, async () => "done")).resolves.toBe("done");
    await expect(
      lanes.inPointOfSaleLane(7, async () => {
        throw new Error("the call broke");
      }),
    ).rejects.toThrow("the call broke");
    await expect(lanes.inPointOfSaleLane(7, async () => "after")).resolves.toBe("after");
  });
});
