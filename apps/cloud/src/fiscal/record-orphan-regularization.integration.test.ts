import { FACTURA_C_VOUCHER_TYPE } from "@purosur/domain";
import type { NumberingConflictLane, OrphanRegularization } from "@purosur/domain/fiscal/use-cases";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { alerts, creditNotes, fiscalRequests, fiscalTasks } from "../platform/db/schema.js";
import { postgresDedicatedConnections } from "../platform/dedicated-connections.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzleNumberingConflictLanes } from "./drizzle-numbering-conflict-lanes.js";
import { DrizzleUnclearOutcomeLanes } from "./drizzle-unclear-outcome-lanes.js";
import { recordOrphanRegularization } from "./record-orphan-regularization.js";
import {
  authorizationRequestRecord,
  insertRegisterWithPointOfSale,
} from "./test-support/authorization-request-fixtures.js";
import { insertOfflineFiscalDocument } from "./test-support/offline-fiscal-document-fixtures.js";
import {
  creditNoteRegularization,
  externalInvoicingRegularization,
  OPENED_AT,
} from "./test-support/orphan-regularization-fixtures.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
const registers = new Map<number, string>();
const enqueued: string[] = [];
let sequence = 1_000;

function nextNumber(): number {
  sequence += 2;
  return sequence;
}

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("record_orphan_regularization");
  sql = postgres(integrationDb.databaseUrl, { max: 8 });
  db = drizzle(sql);
  for (const pointOfSale of [7, 9, 11, 13, 15, 17, 19, 21]) {
    registers.set(
      pointOfSale,
      await insertRegisterWithPointOfSale(db, {
        pointOfSaleNumber: pointOfSale,
        name: `caja-${pointOfSale}`,
      }),
    );
  }
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function registerOf(pointOfSale: number): string {
  const registerId = registers.get(pointOfSale);
  if (registerId === undefined) {
    throw new Error("test setup: no register holds the point of sale");
  }
  return registerId;
}

type OrphanLane = NumberingConflictLane & {
  recordOrphanRegularization(regularization: OrphanRegularization): Promise<void>;
};

function lanes(
  enqueueCreditNote = async (_: unknown, creditNoteId: string) => {
    enqueued.push(creditNoteId);
  },
) {
  const numberingLanes = new DrizzleNumberingConflictLanes(
    postgresDedicatedConnections(sql),
    async () => {},
    enqueueCreditNote,
    () => OPENED_AT,
  );
  return {
    inPointOfSaleLane: <TOutcome>(
      pointOfSale: number,
      work: (lane: OrphanLane) => Promise<TOutcome>,
    ) =>
      numberingLanes.inPointOfSaleLane(pointOfSale, (lane) =>
        work(
          Object.assign(Object.create(lane) as NumberingConflictLane, {
            recordOrphanRegularization: (regularization: OrphanRegularization) =>
              lane.settleNumberingReconciliation({
                regularizations: [regularization],
                lastAuthorized: 0,
              }),
          }),
        ),
      ),
  };
}

function inLane<TOutcome>(pointOfSale: number, work: (lane: OrphanLane) => Promise<TOutcome>) {
  return lanes().inPointOfSaleLane(pointOfSale, work);
}

async function recordedRequest(
  pointOfSale: number,
  number: number,
  columns: Partial<typeof fiscalRequests.$inferInsert> = {},
) {
  const request = authorizationRequestRecord(registerOf(pointOfSale), { pointOfSale, number });
  await db.insert(fiscalRequests).values({ ...request, ...columns });
  return request;
}

describe("recording the regularization of an orphan authorization on a real Postgres", () => {
  describe("the local requests at an authorization's number", () => {
    const requestsAt = (pointOfSale: number, number: number) =>
      inLane(pointOfSale, (lane) => lane.requestsAtNumber({ pointOfSale, number }));

    it("are none for a number nothing local stands behind", async () => {
      expect(await requestsAt(9, 1)).toEqual({ kind: "requests", requests: [] });
    });

    it("are each request at the number, with its document and what the tax authority answered it", async () => {
      const unanswered = await recordedRequest(9, 20);
      const rejected = await recordedRequest(9, 20, {
        issuedOn: "2026-10-07",
        total: 2_500,
        buyerTaxStatusCode: 6,
        receivedAt: new Date(unanswered.receivedAt.getTime() + 1_000),
        answerKind: "rejected",
        rejectionCodes: [10016],
        rejectionClass: "content",
        answeredAt: OPENED_AT,
      });

      expect(await requestsAt(9, 20)).toEqual({
        kind: "requests",
        requests: [
          {
            fiscalDocumentId: unanswered.fiscalDocumentId,
            saleId: unanswered.saleId,
            issuedOn: unanswered.issuedOn,
            total: unanswered.total,
            buyerTaxStatusCode: unanswered.buyerTaxStatusCode,
            answer: null,
          },
          {
            fiscalDocumentId: rejected.fiscalDocumentId,
            saleId: rejected.saleId,
            issuedOn: "2026-10-07",
            total: 2_500,
            buyerTaxStatusCode: 6,
            answer: { kind: "rejected", codes: [10016], rejectionClass: "content" },
          },
        ],
      });
    });

    it("do not take a request of another point of sale at the same number", async () => {
      await recordedRequest(11, 21);

      expect(await requestsAt(9, 21)).toEqual({ kind: "requests", requests: [] });
    });

    it("are regularized once a credit note was requested for the orphan", async () => {
      await recordedRequest(11, 30);
      await inLane(11, (lane) =>
        lane.recordOrphanRegularization(
          creditNoteRegularization({
            pointOfSale: 11,
            associatedVoucher: { voucherType: 11, pointOfSale: 11, number: 30 },
          }),
        ),
      );

      expect(await requestsAt(11, 30)).toEqual({ kind: "already_regularized" });
    });

    it("are regularized once a credit note of a voided sale corrects the voucher, whichever point of sale issues it", async () => {
      await recordedRequest(9, 32);
      await db.insert(creditNotes).values({
        id: crypto.randomUUID(),
        registerId: registerOf(11),
        saleId: crypto.randomUUID(),
        pointOfSale: 11,
        reason: "sale_void",
        associatedVoucherType: 11,
        associatedPointOfSale: 9,
        associatedNumber: 32,
        total: 12_500,
        receiverTaxStatusCode: 5,
        createdAt: OPENED_AT,
      });

      expect(await requestsAt(9, 32)).toEqual({ kind: "already_regularized" });
    });

    it("are regularized once a task for a person was opened for the orphan", async () => {
      await inLane(11, (lane) =>
        lane.recordOrphanRegularization(
          externalInvoicingRegularization({ pointOfSale: 11, number: 31 }),
        ),
      );

      expect(await requestsAt(11, 31)).toEqual({ kind: "already_regularized" });
    });
  });

  describe("the other documents of the sale behind a request", () => {
    it("are the sale's offline document and its other requests, with what was recorded of each", async () => {
      const number = nextNumber();
      const orphan = await recordedRequest(9, number);
      await insertOfflineFiscalDocument(db, {
        registerId: registerOf(9),
        pointOfSale: 31,
        fortnight: { start: "2026-10-01", end: "2026-10-15" },
        number: 5,
        saleId: orphan.saleId,
      });
      await recordedRequest(9, number + 1, {
        saleId: orphan.saleId,
        answerKind: "unclear",
        unclearCodes: [],
        answeredAt: OPENED_AT,
        decision: "released",
        decidedAt: OPENED_AT,
      });

      expect(
        await inLane(9, (lane) =>
          lane.otherDocumentsOfSale(orphan.saleId, orphan.fiscalDocumentId),
        ),
      ).toEqual([
        {
          kind: "offline",
          voucher: { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale: 31, number: 5 },
        },
        {
          kind: "real_time",
          voucher: { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale: 9, number: number + 1 },
          outcome: { answer: { kind: "unclear" }, decision: { kind: "released" } },
        },
      ]);
    });
  });

  describe("recording a credit note request", () => {
    it("keeps the credit note, owned by the register of the point of sale, and asks for it to be issued", async () => {
      enqueued.length = 0;
      const regularization = creditNoteRegularization({
        pointOfSale: 13,
        associatedVoucher: { voucherType: 11, pointOfSale: 13, number: 50 },
        keptVoucher: { voucherType: 11, pointOfSale: 31, number: 8 },
      });

      await inLane(13, (lane) => lane.recordOrphanRegularization(regularization));

      const rows = await db.select().from(creditNotes);
      expect(rows.filter((row) => row.pointOfSale === 13)).toEqual([
        {
          id: regularization.creditNoteId,
          registerId: registerOf(13),
          saleId: regularization.saleId,
          pointOfSale: 13,
          associatedPointOfSale: 13,
          reason: "orphan",
          associatedVoucherType: 11,
          associatedNumber: 50,
          keptVoucherType: 11,
          keptPointOfSale: 31,
          keptNumber: 8,
          total: 12_500,
          receiverTaxStatusCode: 5,
          number: null,
          issuedOn: null,
          requestedAt: null,
          answerKind: null,
          answeredAt: null,
          authorizationCode: null,
          authorizationCodeDueOn: null,
          rejections: null,
          createdAt: OPENED_AT,
        },
      ]);
      expect(enqueued).toEqual([regularization.creditNoteId]);
    });

    it("keeps one credit note for an orphan however many times it is recorded, and asks for it once", async () => {
      enqueued.length = 0;
      const orphan = { voucherType: 11, pointOfSale: 15, number: 60 };
      const first = creditNoteRegularization({ pointOfSale: 15, associatedVoucher: orphan });
      const again = creditNoteRegularization({ pointOfSale: 15, associatedVoucher: orphan });

      await inLane(15, (lane) => lane.recordOrphanRegularization(first));
      await inLane(15, (lane) => lane.recordOrphanRegularization(again));

      const rows = await db.select().from(creditNotes);
      expect(rows.filter((row) => row.pointOfSale === 15).map((row) => row.id)).toEqual([
        first.creditNoteId,
      ]);
      expect(enqueued).toEqual([first.creditNoteId]);
    });

    it("keeps nothing when asking for the credit note to be issued fails", async () => {
      const regularization = creditNoteRegularization({
        pointOfSale: 17,
        associatedVoucher: { voucherType: 11, pointOfSale: 17, number: 70 },
      });
      const failing = lanes(async () => {
        throw new Error("the queue refused");
      });

      await expect(
        failing.inPointOfSaleLane(17, (lane) => lane.recordOrphanRegularization(regularization)),
      ).rejects.toThrow("the queue refused");

      const rows = await db.select().from(creditNotes);
      expect(rows.filter((row) => row.pointOfSale === 17)).toEqual([]);
    });

    it("keeps one credit note when two detections of the same orphan record it at once", async () => {
      enqueued.length = 0;
      const orphan = { voucherType: 11, pointOfSale: 19, number: 80 };
      const detections = [1, 2, 3].map(() =>
        creditNoteRegularization({ pointOfSale: 19, associatedVoucher: orphan }),
      );

      await Promise.all(
        detections.map((regularization) =>
          inLane(19, (lane) => lane.recordOrphanRegularization(regularization)),
        ),
      );

      const rows = (await db.select().from(creditNotes)).filter((row) => row.pointOfSale === 19);
      expect(rows).toHaveLength(1);
      expect(enqueued).toEqual([rows[0]?.id]);
    });

    it("keeps one credit note when a decision and a reconciliation detect the same orphan at once", async () => {
      enqueued.length = 0;
      const request = await recordedRequest(19, 85, {
        answerKind: "unclear",
        unclearCodes: [],
        answeredAt: OPENED_AT,
      });
      const orphan = { voucherType: 11, pointOfSale: 19, number: 85 };
      const unclearLanes = new DrizzleUnclearOutcomeLanes(
        postgresDedicatedConnections(sql),
        async () => {},
        async (_, creditNoteId) => {
          enqueued.push(creditNoteId);
        },
      );

      await Promise.all([
        unclearLanes.inPointOfSaleLane(19, (lane) =>
          lane.recordDecision(
            request.fiscalDocumentId,
            {
              kind: "adopted",
              authorizationCode: "74123456789012",
              authorizationCodeDueOn: "2026-10-16",
            },
            OPENED_AT,
            { fiscalDocumentId: request.fiscalDocumentId, clearedAt: OPENED_AT },
            creditNoteRegularization({ pointOfSale: 19, associatedVoucher: orphan }),
          ),
        ),
        inLane(19, (lane) =>
          lane.recordOrphanRegularization(
            creditNoteRegularization({ pointOfSale: 19, associatedVoucher: orphan }),
          ),
        ),
      ]);

      const rows = (await db.select().from(creditNotes)).filter(
        (row) => row.pointOfSale === 19 && row.associatedNumber === 85,
      );
      expect(rows).toHaveLength(1);
      expect(enqueued).toEqual([rows[0]?.id]);
    });

    it("keeps one credit note when two transactions record the same orphan without any lane between them", async () => {
      enqueued.length = 0;
      const orphan = { voucherType: 11, pointOfSale: 21, number: 90 };
      const record = (regularization: OrphanRegularization) =>
        db.transaction((tx) =>
          recordOrphanRegularization(tx, regularization, {
            at: OPENED_AT,
            enqueueCreditNote: async (_, creditNoteId) => {
              enqueued.push(creditNoteId);
            },
          }),
        );

      await Promise.all([
        record(creditNoteRegularization({ pointOfSale: 21, associatedVoucher: orphan })),
        record(creditNoteRegularization({ pointOfSale: 21, associatedVoucher: orphan })),
      ]);

      const rows = (await db.select().from(creditNotes)).filter((row) => row.pointOfSale === 21);
      expect(rows).toHaveLength(1);
      expect(enqueued).toHaveLength(1);
    });
  });

  describe("recording invoicing outside the register", () => {
    it("opens an alert and a task naming the voucher, owned by the register of the point of sale", async () => {
      await inLane(9, (lane) =>
        lane.recordOrphanRegularization(
          externalInvoicingRegularization({ pointOfSale: 9, number: 100 }),
        ),
      );

      const [task] = (await db.select().from(fiscalTasks)).filter(
        (row) => row.pointOfSale === 9 && row.number === 100,
      );
      expect(task).toEqual({
        id: expect.any(String),
        kind: "external_invoicing",
        registerId: registerOf(9),
        pointOfSale: 9,
        documentType: "factura_c",
        number: 100,
        creditNoteId: null,
        reason: { issuedOn: "2026-10-05", total: 12_500, authorizationCode: "74123456789012" },
        state: "open",
        createdAt: OPENED_AT,
        closedAt: null,
      });
      const alert = (await db.select().from(alerts)).find((row) => row.scope === "9:factura_c:100");
      expect(alert).toMatchObject({
        kind: "external_billing",
        detail: { pointOfSale: 9, documentType: "factura_c", number: 100 },
        resolvedAt: null,
      });
    });

    it("opens one alert and one task for a voucher however many times it is detected", async () => {
      for (let detection = 0; detection < 3; detection += 1) {
        await inLane(9, (lane) =>
          lane.recordOrphanRegularization(
            externalInvoicingRegularization({ pointOfSale: 9, number: 101 }),
          ),
        );
      }

      expect(
        (await db.select().from(fiscalTasks)).filter((row) => row.number === 101),
      ).toHaveLength(1);
      expect(
        (await db.select().from(alerts)).filter((row) => row.scope === "9:factura_c:101"),
      ).toHaveLength(1);
    });

    it("keeps the task of a credit note number apart from the task of an invoice number", async () => {
      await inLane(9, (lane) =>
        lane.recordOrphanRegularization(
          externalInvoicingRegularization({ pointOfSale: 9, number: 102 }),
        ),
      );
      await inLane(9, (lane) =>
        lane.recordOrphanRegularization(
          externalInvoicingRegularization({
            pointOfSale: 9,
            number: 102,
            documentType: "credit_note_c",
          }),
        ),
      );

      expect(
        (await db.select().from(fiscalTasks))
          .filter((row) => row.number === 102)
          .map((row) => row.documentType)
          .sort(),
      ).toEqual(["credit_note_c", "factura_c"]);
    });

    it("opens no alert when opening the task fails", async () => {
      const admin = postgres(integrationDb.adminDatabaseUrl, { max: 1 });
      await admin.unsafe(`
        create function refuse_fiscal_task() returns trigger language plpgsql as $$
        begin raise exception 'the task broke'; end; $$`);
      await admin.unsafe(`
        create trigger refuse_fiscal_task before insert on fiscal_tasks
        for each row execute function refuse_fiscal_task()`);
      try {
        await expect(
          inLane(9, (lane) =>
            lane.recordOrphanRegularization(
              externalInvoicingRegularization({ pointOfSale: 9, number: 103 }),
            ),
          ),
        ).rejects.toThrow();
      } finally {
        await admin.unsafe("drop trigger refuse_fiscal_task on fiscal_tasks");
        await admin.unsafe("drop function refuse_fiscal_task()");
        await admin.end({ timeout: 1 });
      }

      expect(
        (await db.select().from(alerts)).filter((row) => row.scope === "9:factura_c:103"),
      ).toEqual([]);
    });
  });
});
