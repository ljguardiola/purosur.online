import { FACTURA_C_DOCUMENT_TYPE, FACTURA_C_VOUCHER_TYPE } from "@purosur/domain";
import type { NumberingConflictLane } from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  alerts,
  fiscalRequests,
  fiscalTasks,
  orphanCreditNotes,
  taxAuthorityLastAuthorizedNumbers,
} from "../platform/db/schema.js";
import { postgresDedicatedConnections } from "../platform/dedicated-connections.js";
import { changesLoggedAfter, lastLoggedChangeSeq } from "../sync/test-support/logged-changes.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzleNumberingConflictLanes } from "./drizzle-numbering-conflict-lanes.js";
import {
  authorizationRequestRecord,
  insertRegisterWithPointOfSale,
} from "./test-support/authorization-request-fixtures.js";
import {
  creditNoteRegularization,
  externalInvoicingRegularization,
} from "./test-support/orphan-regularization-fixtures.js";

const NOW = new Date("2026-10-06T15:05:00.000Z");
const FROZEN_AT = new Date("2026-10-06T15:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let registerId: string;
const reconciliationRequests: number[] = [];
const creditNotesEnqueued: string[] = [];
let settled = 0;
let frozenRequests = 0;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("numbering_conflict_lanes");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
  registerId = await insertRegisterWithPointOfSale(db, {
    pointOfSaleNumber: 7,
    name: "caja-1",
  });
  await insertRegisterWithPointOfSale(db, { pointOfSaleNumber: 8, name: "caja-2" });
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function lanes() {
  return new DrizzleNumberingConflictLanes(
    postgresDedicatedConnections(sql),
    async (_, pointOfSale) => {
      reconciliationRequests.push(pointOfSale);
    },
    async (_, creditNoteId) => {
      creditNotesEnqueued.push(creditNoteId);
    },
    () => NOW,
  );
}

function inLane<TOutcome>(
  pointOfSale: number,
  work: (lane: NumberingConflictLane) => Promise<TOutcome>,
) {
  return lanes().inPointOfSaleLane(pointOfSale, work);
}

function settle(
  pointOfSale: number,
  settlement: Parameters<NumberingConflictLane["settleNumberingReconciliation"]>[0],
) {
  return inLane(pointOfSale, (lane) => lane.settleNumberingReconciliation(settlement));
}

async function recordRequest(
  pointOfSale: number,
  number: number,
  columns: Partial<typeof fiscalRequests.$inferInsert> = {},
) {
  const request = authorizationRequestRecord(registerId, { pointOfSale, number });
  await db.insert(fiscalRequests).values({ ...request, ...columns });
  return request.fiscalDocumentId;
}

const UNCLEAR_NUMBERING_CONFLICT: Partial<typeof fiscalRequests.$inferInsert> = {
  answerKind: "unclear",
  unclearCodes: [10016],
  answeredAt: FROZEN_AT,
};

async function freeze(pointOfSale: number, countBeforeFreeze: number, numberingLanes = lanes()) {
  frozenRequests += 1;
  const fiscalDocumentId = await recordRequest(
    pointOfSale,
    900 + frozenRequests,
    UNCLEAR_NUMBERING_CONFLICT,
  );
  await numberingLanes.inPointOfSaleLane(pointOfSale, (lane) =>
    lane.recordNumberingDiagnosis({
      fiscalDocumentId,
      diagnosis: { kind: "collision" },
      diagnosedAt: NOW,
      freeze: { countBeforeFreeze, frozenAt: FROZEN_AT },
    }),
  );
  return fiscalDocumentId;
}

async function diagnosisRowOf(fiscalDocumentId: string) {
  const [row] = await db
    .select({ diagnosis: fiscalRequests.diagnosis, diagnosedAt: fiscalRequests.diagnosedAt })
    .from(fiscalRequests)
    .where(eq(fiscalRequests.fiscalDocumentId, fiscalDocumentId));
  return row;
}

describe("the numbering conflict lane on a real Postgres", () => {
  it("reads an unclear request with the codes it carried and no diagnosis yet", async () => {
    const fiscalDocumentId = await recordRequest(7, 500, {
      issuedOn: "2026-10-05",
      answerKind: "unclear",
      unclearCodes: [10016],
      answeredAt: FROZEN_AT,
    });

    expect(await inLane(7, (lane) => lane.numberingConflictRequest(fiscalDocumentId))).toEqual({
      pointOfSale: 7,
      number: 500,
      issuedOn: "2026-10-05",
      answer: { kind: "unclear" },
      unclearCodes: [10016],
      diagnosis: null,
    });
  });

  it("reads nothing of a request it does not hold", async () => {
    expect(
      await inLane(7, (lane) => lane.numberingConflictRequest(crypto.randomUUID())),
    ).toBeNull();
  });

  it("keeps the diagnosis of a request, with the time it was made", async () => {
    const fiscalDocumentId = await recordRequest(7, 501, UNCLEAR_NUMBERING_CONFLICT);

    await inLane(7, (lane) =>
      lane.recordNumberingDiagnosis({
        fiscalDocumentId,
        diagnosis: { kind: "collision" },
        diagnosedAt: NOW,
        freeze: null,
      }),
    );

    expect(
      (await inLane(7, (lane) => lane.numberingConflictRequest(fiscalDocumentId)))?.diagnosis,
    ).toEqual({ kind: "collision" });
    expect(await diagnosisRowOf(fiscalDocumentId)).toEqual({
      diagnosis: "collision",
      diagnosedAt: NOW,
    });
    expect(await inLane(7, (lane) => lane.numberingFreeze())).toBeNull();
  });

  it("keeps a date-behind diagnosis apart from a collision", async () => {
    const fiscalDocumentId = await recordRequest(7, 502, UNCLEAR_NUMBERING_CONFLICT);

    await inLane(7, (lane) =>
      lane.recordNumberingDiagnosis({
        fiscalDocumentId,
        diagnosis: { kind: "date_behind" },
        diagnosedAt: NOW,
        freeze: null,
      }),
    );

    expect(
      (await inLane(7, (lane) => lane.numberingConflictRequest(fiscalDocumentId)))?.diagnosis,
    ).toEqual({ kind: "date_behind" });
  });

  describe("settling the documents in a range", () => {
    const AUTHORIZED: Partial<typeof fiscalRequests.$inferInsert> = {
      answerKind: "authorized",
      authorizationCode: "74123456789012",
      authorizationCodeDueOn: "2026-10-16",
      answeredAt: FROZEN_AT,
    };
    const UNCLEAR: Partial<typeof fiscalRequests.$inferInsert> = {
      answerKind: "unclear",
      unclearCodes: [],
      answeredAt: FROZEN_AT,
    };

    it.each([
      ["answered authorized", AUTHORIZED, "authorized"],
      [
        "decided adopted",
        {
          ...UNCLEAR,
          decision: "adopted",
          adoptedAuthorizationCode: "75123456789012",
          adoptedAuthorizationCodeDueOn: "2026-10-16",
          decidedAt: NOW,
        },
        "authorized",
      ],
      [
        "decided conflicting",
        { ...UNCLEAR, decision: "conflicting", decidedAt: NOW },
        "conflicting",
      ],
      [
        "decided released",
        { ...UNCLEAR, decision: "released", decidedAt: NOW },
        "released_or_rejected",
      ],
      [
        "answered rejected",
        {
          answerKind: "rejected",
          rejectionCodes: [10015],
          rejectionClass: "content",
          answeredAt: FROZEN_AT,
        },
        "released_or_rejected",
      ],
      [
        "not attempted and decided released",
        {
          answerKind: "not_attempted",
          answeredAt: FROZEN_AT,
          decision: "released",
          decidedAt: NOW,
        },
        "released_or_rejected",
      ],
      [
        "not attempted and not decided",
        { answerKind: "not_attempted", answeredAt: FROZEN_AT },
        "undecided",
      ],
      ["unclear and not decided", UNCLEAR, "undecided"],
      ["not answered yet", {}, "undecided"],
    ] satisfies [string, Partial<typeof fiscalRequests.$inferInsert>, string][])(
      "settles a document %s as %s",
      async (_case, columns, settlement) => {
        const pointOfSale = 8;
        settled += 1;
        const number = 700 + settled;
        await recordRequest(pointOfSale, number, columns);

        const documents = await inLane(pointOfSale, (lane) =>
          lane.documentsInNumberingRange({ after: number - 1, through: number }),
        );

        expect(documents).toEqual([{ number, settlement }]);
      },
    );

    it("gives only the numbers after the first bound through the second, of its own point of sale", async () => {
      const base = 10_000_000;
      await recordRequest(7, base + 1, AUTHORIZED);
      await recordRequest(7, base + 2, AUTHORIZED);
      await recordRequest(7, base + 3, AUTHORIZED);
      await recordRequest(7, base + 4, AUTHORIZED);
      await recordRequest(8, base + 3, AUTHORIZED);

      const documents = await inLane(7, (lane) =>
        lane.documentsInNumberingRange({ after: base + 1, through: base + 3 }),
      );

      expect(documents.map(({ number }) => number)).toEqual([base + 2, base + 3]);
    });
  });

  describe("the freeze", () => {
    it("holds no freeze until one is taken", async () => {
      expect(await inLane(8, (lane) => lane.numberingFreeze())).toBeNull();
    });

    it("holds the count and the time the freeze was taken at, and only for its point of sale", async () => {
      await freeze(7, 12);

      expect(await inLane(7, (lane) => lane.numberingFreeze())).toEqual({
        countBeforeFreeze: 12,
        frozenAt: FROZEN_AT,
      });
      expect(await inLane(8, (lane) => lane.numberingFreeze())).toBeNull();
      await settle(7, { regularizations: [], lastAuthorized: 0 });
    });

    it("lifts the freeze when the reconciliation is settled, and only that one", async () => {
      await freeze(8, 3);
      await freeze(7, 3);

      await settle(7, { regularizations: [], lastAuthorized: 3 });

      expect(await inLane(7, (lane) => lane.numberingFreeze())).toBeNull();
      expect(await inLane(8, (lane) => lane.numberingFreeze())).not.toBeNull();
      await settle(8, { regularizations: [], lastAuthorized: 3 });
    });

    it("logs the register's point of sale as changed when the freeze is taken and, once for the count and the lifted freeze together, when it is settled", async () => {
      const last = await lastLoggedChangeSeq(db);

      await freeze(7, 12);
      await settle(7, { regularizations: [], lastAuthorized: 30 });

      expect(
        (await changesLoggedAfter(db, last)).map(({ entity, entityId, op }) => ({
          entity,
          entityId,
          op,
        })),
      ).toEqual([
        { entity: "register_point_of_sale", entityId: registerId, op: "update" },
        { entity: "register_point_of_sale", entityId: registerId, op: "update" },
      ]);
    });

    it("records the collision and asks for the reconciliation of its point of sale with the freeze", async () => {
      reconciliationRequests.length = 0;

      const fiscalDocumentId = await freeze(7, 12);

      expect(reconciliationRequests).toEqual([7]);
      expect(await diagnosisRowOf(fiscalDocumentId)).toEqual({
        diagnosis: "collision",
        diagnosedAt: NOW,
      });
      await settle(7, { regularizations: [], lastAuthorized: 0 });
    });

    it("leaves neither the diagnosis nor the freeze behind when asking for the reconciliation fails", async () => {
      const failing = new DrizzleNumberingConflictLanes(
        postgresDedicatedConnections(sql),
        async () => {
          throw new Error("the queue refused");
        },
        async () => {},
        () => NOW,
      );
      const last = await lastLoggedChangeSeq(db);

      await expect(freeze(7, 12, failing)).rejects.toThrow("the queue refused");

      const [request] = await db
        .select({ diagnosis: fiscalRequests.diagnosis })
        .from(fiscalRequests)
        .where(eq(fiscalRequests.number, 900 + frozenRequests));
      expect(request).toEqual({ diagnosis: null });
      expect(await inLane(7, (lane) => lane.numberingFreeze())).toBeNull();
      expect(await changesLoggedAfter(db, last)).toEqual([]);
    });
  });

  describe("settling a reconciliation", () => {
    const opening = (number: number) => externalInvoicingRegularization({ pointOfSale: 7, number });

    async function externalBillingScopes() {
      return (await db.select().from(alerts))
        .filter((alert) => alert.kind === "external_billing")
        .map((alert) => alert.scope)
        .sort();
    }

    it("reads zero before any count is recorded", async () => {
      expect(await inLane(9, (lane) => lane.taxAuthorityCount())).toBe(0);
    });

    it("continues the series right after the number, and never lowers a count already held", async () => {
      await settle(8, { regularizations: [], lastAuthorized: 20 });
      expect(await inLane(8, (lane) => lane.taxAuthorityCount())).toBe(20);

      await settle(8, { regularizations: [], lastAuthorized: 15 });
      expect(await inLane(8, (lane) => lane.taxAuthorityCount())).toBe(20);

      await settle(8, { regularizations: [], lastAuthorized: 25 });
      expect(await inLane(8, (lane) => lane.taxAuthorityCount())).toBe(25);
      const rows = await db.select().from(taxAuthorityLastAuthorizedNumbers);
      expect(rows.filter((row) => row.pointOfSaleNumber === 8)).toEqual([
        { pointOfSaleNumber: 8, lastAuthorized: 25, issuedOn: null, readAt: NOW },
      ]);
    });

    it("opens one alert for each number, once however many times it is settled", async () => {
      await settle(7, { regularizations: [opening(31), opening(32)], lastAuthorized: 40 });
      await settle(7, { regularizations: [opening(31)], lastAuthorized: 40 });

      expect(await externalBillingScopes()).toEqual([
        `7:${FACTURA_C_DOCUMENT_TYPE}:31`,
        `7:${FACTURA_C_DOCUMENT_TYPE}:32`,
      ]);
      const [alert] = (await db.select().from(alerts)).filter(
        (row) => row.scope === `7:${FACTURA_C_DOCUMENT_TYPE}:31`,
      );
      expect(alert).toEqual(
        expect.objectContaining({
          kind: "external_billing",
          detail: { pointOfSale: 7, documentType: FACTURA_C_DOCUMENT_TYPE, number: 31 },
          resolvedAt: null,
        }),
      );
    });

    it("leaves the alerts, the count and the freeze as they were when it fails", async () => {
      await freeze(7, 12);
      const scopesBefore = await externalBillingScopes();
      const countBefore = await inLane(7, (lane) => lane.taxAuthorityCount());
      const last = await lastLoggedChangeSeq(db);
      const admin = postgres(integrationDb.adminDatabaseUrl, { max: 1 });
      await admin.unsafe(`
        create function refuse_freeze_lift() returns trigger language plpgsql as $$
        begin raise exception 'the lift broke'; end; $$`);
      await admin.unsafe(`
        create trigger refuse_freeze_lift before delete on numbering_freezes
        for each row execute function refuse_freeze_lift()`);
      try {
        await expect(
          settle(7, { regularizations: [opening(51), opening(52)], lastAuthorized: 99 }),
        ).rejects.toThrow();
      } finally {
        await admin.unsafe("drop trigger refuse_freeze_lift on numbering_freezes");
        await admin.unsafe("drop function refuse_freeze_lift()");
        await admin.end({ timeout: 1 });
      }

      expect(await externalBillingScopes()).toEqual(scopesBefore);
      expect(await inLane(7, (lane) => lane.taxAuthorityCount())).toBe(countBefore);
      expect(await inLane(7, (lane) => lane.numberingFreeze())).not.toBeNull();
      expect(await changesLoggedAfter(db, last)).toEqual([]);
      await settle(7, { regularizations: [], lastAuthorized: 0 });
    });
  });

  describe("the local requests at an authorization's number", () => {
    const standingOf = (pointOfSale: number, number: number) =>
      inLane(pointOfSale, (lane) => lane.requestsAtNumber({ pointOfSale, number }));

    it("are none for a number no request holds", async () => {
      expect(await standingOf(7, 3_000)).toEqual({ kind: "requests", requests: [] });
    });

    it("are the request at the number, with its document and no answer while it has none", async () => {
      const request = authorizationRequestRecord(registerId, { pointOfSale: 7, number: 3_001 });
      await db.insert(fiscalRequests).values(request);

      expect(await standingOf(7, 3_001)).toEqual({
        kind: "requests",
        requests: [
          {
            fiscalDocumentId: request.fiscalDocumentId,
            saleId: request.saleId,
            issuedOn: request.issuedOn,
            total: request.total,
            buyerTaxStatusCode: request.buyerTaxStatusCode,
            answer: null,
          },
        ],
      });
    });

    it("lead to the other request of the sale with its authorization", async () => {
      const orphan = authorizationRequestRecord(registerId, { pointOfSale: 7, number: 3_002 });
      await db.insert(fiscalRequests).values(orphan);
      await db.insert(fiscalRequests).values({
        ...authorizationRequestRecord(registerId, {
          pointOfSale: 7,
          number: 3_003,
          saleId: orphan.saleId,
        }),
        answerKind: "authorized",
        authorizationCode: "75123456789012",
        authorizationCodeDueOn: "2026-10-16",
        answeredAt: FROZEN_AT,
      });

      expect(
        await inLane(7, (lane) =>
          lane.otherDocumentsOfSale(orphan.saleId, orphan.fiscalDocumentId),
        ),
      ).toEqual([
        {
          kind: "real_time",
          voucher: { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale: 7, number: 3_003 },
          outcome: {
            answer: {
              kind: "authorized",
              authorizationCode: "75123456789012",
              authorizationCodeDueOn: "2026-10-16",
            },
            decision: null,
          },
        },
      ]);
    });

    it("is regularized once a credit note was requested for the orphan", async () => {
      await db
        .insert(fiscalRequests)
        .values(authorizationRequestRecord(registerId, { pointOfSale: 7, number: 3_004 }));
      await settle(7, {
        regularizations: [
          creditNoteRegularization({
            pointOfSale: 7,
            associatedVoucher: { voucherType: 11, pointOfSale: 7, number: 3_004 },
          }),
        ],
        lastAuthorized: 0,
      });

      expect(await standingOf(7, 3_004)).toEqual({ kind: "already_regularized" });
    });

    it("is regularized once a task for a person was opened for the orphan", async () => {
      await settle(7, {
        regularizations: [externalInvoicingRegularization({ pointOfSale: 7, number: 3_005 })],
        lastAuthorized: 0,
      });

      expect(await standingOf(7, 3_005)).toEqual({ kind: "already_regularized" });
    });
  });

  describe("settling a reconciliation with credit notes", () => {
    it("keeps each credit note request and asks for it to be issued, together with the count and the lifted freeze", async () => {
      creditNotesEnqueued.length = 0;
      await freeze(8, 3);
      const regularization = creditNoteRegularization({
        pointOfSale: 8,
        associatedVoucher: { voucherType: 11, pointOfSale: 8, number: 4_000 },
      });

      await settle(8, { regularizations: [regularization], lastAuthorized: 4_001 });

      expect(
        (await db.select().from(orphanCreditNotes)).filter((row) => row.pointOfSale === 8),
      ).toMatchObject([{ id: regularization.creditNoteId, associatedNumber: 4_000 }]);
      expect(creditNotesEnqueued).toEqual([regularization.creditNoteId]);
      expect(await inLane(8, (lane) => lane.taxAuthorityCount())).toBe(4_001);
      expect(await inLane(8, (lane) => lane.numberingFreeze())).toBeNull();
    });

    it("keeps no credit note and keeps the freeze when the settlement fails", async () => {
      await freeze(7, 12);
      const regularization = creditNoteRegularization({
        pointOfSale: 7,
        associatedVoucher: { voucherType: 11, pointOfSale: 7, number: 4_100 },
      });
      const admin = postgres(integrationDb.adminDatabaseUrl, { max: 1 });
      await admin.unsafe(`
        create function refuse_freeze_lift() returns trigger language plpgsql as $$
        begin raise exception 'the lift broke'; end; $$`);
      await admin.unsafe(`
        create trigger refuse_freeze_lift before delete on numbering_freezes
        for each row execute function refuse_freeze_lift()`);
      try {
        await expect(
          settle(7, { regularizations: [regularization], lastAuthorized: 4_101 }),
        ).rejects.toThrow();
      } finally {
        await admin.unsafe("drop trigger refuse_freeze_lift on numbering_freezes");
        await admin.unsafe("drop function refuse_freeze_lift()");
        await admin.end({ timeout: 1 });
      }

      expect(
        (await db.select().from(orphanCreditNotes)).filter((row) => row.associatedNumber === 4_100),
      ).toEqual([]);
      expect(await inLane(7, (lane) => lane.numberingFreeze())).not.toBeNull();
      await settle(7, { regularizations: [], lastAuthorized: 0 });
    });

    it("keeps one task per voucher when the same voucher is settled again", async () => {
      await settle(7, {
        regularizations: [externalInvoicingRegularization({ pointOfSale: 7, number: 4_200 })],
        lastAuthorized: 0,
      });
      await settle(7, {
        regularizations: [externalInvoicingRegularization({ pointOfSale: 7, number: 4_200 })],
        lastAuthorized: 0,
      });

      expect(
        (await db.select().from(fiscalTasks)).filter((row) => row.number === 4_200),
      ).toHaveLength(1);
    });
  });
});
