import { FACTURA_C_VOUCHER_TYPE } from "@purosur/domain";
import {
  type OrphanRegularization,
  type OrphanRegularizationLane,
  regularizeOrphanAuthorization,
} from "@purosur/domain/fiscal/use-cases";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { alerts, fiscalRequests, fiscalTasks, orphanCreditNotes } from "../platform/db/schema.js";
import { postgresDedicatedConnections } from "../platform/dedicated-connections.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzleOrphanRegularizationLanes } from "./drizzle-orphan-regularization-lanes.js";
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

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("orphan_regularization_lanes");
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

function lanes(
  enqueueOrphanCreditNote = async (_: unknown, creditNoteId: string) => {
    enqueued.push(creditNoteId);
  },
) {
  return new DrizzleOrphanRegularizationLanes(
    postgresDedicatedConnections(sql),
    enqueueOrphanCreditNote,
    () => OPENED_AT,
  );
}

function inLane<TOutcome>(
  pointOfSale: number,
  work: (lane: OrphanRegularizationLane) => Promise<TOutcome>,
) {
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

describe("the orphan regularization lane on a real Postgres", () => {
  describe("the local standing of an authorization", () => {
    it("holds no local sale for a number nothing local stands behind", async () => {
      expect(
        await inLane(9, (lane) => lane.localStandingOfAuthorization({ pointOfSale: 9, number: 1 })),
      ).toEqual({ kind: "no_local_sale" });
    });

    it("holds the sale of the request at the number, with no other authorized voucher when it has none", async () => {
      const request = await recordedRequest(9, 20);

      expect(
        await inLane(9, (lane) =>
          lane.localStandingOfAuthorization({ pointOfSale: 9, number: 20 }),
        ),
      ).toEqual({ kind: "local_sale", saleId: request.saleId, otherAuthorizedVoucher: null });
    });

    it("does not take a request of another point of sale at the same number", async () => {
      await recordedRequest(11, 21);

      expect(
        await inLane(9, (lane) =>
          lane.localStandingOfAuthorization({ pointOfSale: 9, number: 21 }),
        ),
      ).toEqual({ kind: "no_local_sale" });
    });

    it("names the voucher of the offline point of sale that the same sale holds", async () => {
      const request = await recordedRequest(9, 22);
      await insertOfflineFiscalDocument(db, {
        registerId: registerOf(9),
        pointOfSale: 31,
        fortnight: { start: "2026-10-01", end: "2026-10-15" },
        number: 5,
        saleId: request.saleId,
      });

      expect(
        await inLane(9, (lane) =>
          lane.localStandingOfAuthorization({ pointOfSale: 9, number: 22 }),
        ),
      ).toEqual({
        kind: "local_sale",
        saleId: request.saleId,
        otherAuthorizedVoucher: { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale: 31, number: 5 },
      });
    });

    it.each([
      [
        "authorized",
        {
          answerKind: "authorized",
          authorizationCode: "75123456789012",
          authorizationCodeDueOn: "2026-10-16",
          answeredAt: OPENED_AT,
        },
      ],
      [
        "adopted after being left unclear",
        {
          answerKind: "unclear",
          unclearCodes: [],
          answeredAt: OPENED_AT,
          decision: "adopted",
          decidedAt: OPENED_AT,
          adoptedAuthorizationCode: "75123456789012",
          adoptedAuthorizationCodeDueOn: "2026-10-16",
        },
      ],
    ] as const)("names the other request of the same sale that is %s", async (_case, columns) => {
      const orphan = await recordedRequest(9, 23);
      await recordedRequest(9, 24, { saleId: orphan.saleId, ...columns });

      expect(
        await inLane(9, (lane) =>
          lane.localStandingOfAuthorization({ pointOfSale: 9, number: 23 }),
        ),
      ).toEqual({
        kind: "local_sale",
        saleId: orphan.saleId,
        otherAuthorizedVoucher: { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale: 9, number: 24 },
      });
    });

    it.each([
      [
        "rejected",
        {
          answerKind: "rejected",
          rejectionCodes: [10015],
          rejectionClass: "content",
          answeredAt: OPENED_AT,
        },
      ],
      ["unclear", { answerKind: "unclear", unclearCodes: [], answeredAt: OPENED_AT }],
      [
        "released",
        {
          answerKind: "unclear",
          unclearCodes: [],
          answeredAt: OPENED_AT,
          decision: "released",
          decidedAt: OPENED_AT,
        },
      ],
      [
        "conflicting",
        {
          answerKind: "unclear",
          unclearCodes: [],
          answeredAt: OPENED_AT,
          decision: "conflicting",
          decidedAt: OPENED_AT,
        },
      ],
    ] as const)(
      "does not take another request of the same sale that is %s as authorized",
      async (_case, columns) => {
        const orphan = await recordedRequest(9, 25);
        await recordedRequest(9, 26, { saleId: orphan.saleId, ...columns });

        expect(
          await inLane(9, (lane) =>
            lane.localStandingOfAuthorization({ pointOfSale: 9, number: 25 }),
          ),
        ).toMatchObject({ kind: "local_sale", otherAuthorizedVoucher: null });
      },
    );

    it("is regularized once a credit note was requested for the orphan", async () => {
      await recordedRequest(11, 30);
      await inLane(11, (lane) =>
        lane.recordOrphanRegularization(
          creditNoteRegularization({
            pointOfSale: 11,
            associatedVoucher: { voucherType: 11, pointOfSale: 11, number: 30 },
          }),
        ),
      );

      expect(
        await inLane(11, (lane) =>
          lane.localStandingOfAuthorization({ pointOfSale: 11, number: 30 }),
        ),
      ).toEqual({ kind: "already_regularized" });
    });

    it("is regularized once a task for a person was opened for the orphan", async () => {
      await inLane(11, (lane) =>
        lane.recordOrphanRegularization(
          externalInvoicingRegularization({ pointOfSale: 11, number: 31 }),
        ),
      );

      expect(
        await inLane(11, (lane) =>
          lane.localStandingOfAuthorization({ pointOfSale: 11, number: 31 }),
        ),
      ).toEqual({ kind: "already_regularized" });
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

      const rows = await db.select().from(orphanCreditNotes);
      expect(rows.filter((row) => row.pointOfSale === 13)).toEqual([
        {
          id: regularization.creditNoteId,
          registerId: registerOf(13),
          saleId: regularization.saleId,
          pointOfSale: 13,
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

      const rows = await db.select().from(orphanCreditNotes);
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

      const rows = await db.select().from(orphanCreditNotes);
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

      const rows = (await db.select().from(orphanCreditNotes)).filter(
        (row) => row.pointOfSale === 19,
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
            enqueueOrphanCreditNote: async (_, creditNoteId) => {
              enqueued.push(creditNoteId);
            },
          }),
        );

      await Promise.all([
        record(creditNoteRegularization({ pointOfSale: 21, associatedVoucher: orphan })),
        record(creditNoteRegularization({ pointOfSale: 21, associatedVoucher: orphan })),
      ]);

      const rows = (await db.select().from(orphanCreditNotes)).filter(
        (row) => row.pointOfSale === 21,
      );
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

  describe("regularizing an orphan authorization", () => {
    it("keeps one credit note when the orphan is regularized twice at once", async () => {
      enqueued.length = 0;
      const orphan = await recordedRequest(9, 200);
      await recordedRequest(9, 201, {
        saleId: orphan.saleId,
        answerKind: "authorized",
        authorizationCode: "75123456789012",
        authorizationCodeDueOn: "2026-10-16",
        answeredAt: OPENED_AT,
      });
      const ports = {
        lanes: lanes(),
        clock: { now: () => OPENED_AT },
        ids: { next: () => crypto.randomUUID() },
        tokens: {
          validToken: async () => ({
            token: "t",
            sign: "s",
            issuedAt: OPENED_AT,
            expiresAt: new Date(OPENED_AT.getTime() + 60_000),
          }),
        },
        vouchers: {
          voucherAt: async () => ({
            kind: "found" as const,
            voucher: {
              issuedOn: "2026-10-05",
              total: 1500,
              documentType: 11,
              receiverDocumentType: 99,
              receiverDocumentNumber: 0,
              receiverTaxStatusCode: 5,
              authorizationCode: "74123456789012",
              authorizationCodeDueOn: "2026-10-15",
            },
          }),
        },
      };

      const outcomes = await Promise.all([
        regularizeOrphanAuthorization(ports, { pointOfSale: 9, number: 200 }),
        regularizeOrphanAuthorization(ports, { pointOfSale: 9, number: 200 }),
      ]);

      expect(outcomes.map(({ kind }) => kind).sort()).toEqual([
        "nothing_to_regularize",
        "regularized",
      ]);
      expect(
        (await db.select().from(orphanCreditNotes)).filter(
          (row) => row.pointOfSale === 9 && row.associatedNumber === 200,
        ),
      ).toHaveLength(1);
      expect(enqueued).toHaveLength(1);
    });
  });
});
