import { FACTURA_C_VOUCHER_TYPE } from "@purosur/domain";
import type { RestoredRegisterOrphanLane } from "@purosur/domain/fiscal/use-cases";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  alerts,
  creditNotes,
  fiscalRequests,
  fiscalTasks,
  numberingFreezes,
} from "../platform/db/schema.js";
import { postgresDedicatedConnections } from "../platform/dedicated-connections.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { insertInboxEvent } from "../sync/test-support/inbox-events.js";
import { insertQuarantinedEvent } from "../sync/test-support/quarantined-events.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import {
  DrizzleRegisterFiscalPointsOfSale,
  DrizzleRestoredRegisterOrphanLanes,
} from "./drizzle-restored-register-orphan-lanes.js";
import {
  authorizationRequestRecord,
  insertRegisterWithPointOfSale,
  RECEIVED_AT,
} from "./test-support/authorization-request-fixtures.js";
import { insertOfflineFiscalDocument } from "./test-support/offline-fiscal-document-fixtures.js";
import {
  creditNoteRegularization,
  externalInvoicingRegularization,
  OPENED_AT,
} from "./test-support/orphan-regularization-fixtures.js";
import { insertRecordedSale } from "./test-support/recorded-sale-fixtures.js";
import { insertSaleVoidCreditNote } from "./test-support/sale-void-credit-notes.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let registerId: string;
let otherRegisterId: string;
let deviceId: string;
const creditNotesEnqueued: string[] = [];
let sequence = 100;

const AUTHORIZED: Partial<typeof fiscalRequests.$inferInsert> = {
  answerKind: "authorized",
  authorizationCode: "74123456789012",
  authorizationCodeDueOn: "2026-10-16",
  answeredAt: RECEIVED_AT,
};

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("restored_register_orphan_lanes");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
  registerId = await insertRegisterWithPointOfSale(db, { pointOfSaleNumber: 7, name: "caja-1" });
  otherRegisterId = await insertRegisterWithPointOfSale(db, {
    pointOfSaleNumber: 8,
    name: "caja-2",
  });
  ({ deviceId } = await insertEnrolledInstallation(db, {
    now: RECEIVED_AT,
    registerName: "caja-3",
  }));
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function lanes() {
  return new DrizzleRestoredRegisterOrphanLanes(
    postgresDedicatedConnections(sql),
    async (_, creditNoteId) => {
      creditNotesEnqueued.push(creditNoteId);
    },
    () => OPENED_AT,
  );
}

function inLane<TOutcome>(
  pointOfSale: number,
  work: (lane: RestoredRegisterOrphanLane) => Promise<TOutcome>,
) {
  return lanes().inPointOfSaleLane(pointOfSale, work);
}

async function recordRequest(
  pointOfSale: number,
  columns: Partial<typeof fiscalRequests.$inferInsert> = {},
  owner = registerId,
) {
  sequence += 1;
  const request = authorizationRequestRecord(owner, { pointOfSale, number: sequence });
  await db.insert(fiscalRequests).values({ ...request, ...columns });
  return request;
}

describe("the register's fiscal points of sale on a real Postgres", () => {
  it("gives the point of sale the register holds", async () => {
    expect(
      await new DrizzleRegisterFiscalPointsOfSale(db).fiscalPointsOfSaleOf(registerId),
    ).toEqual([7]);
  });

  it("gives none for a register that holds no point of sale", async () => {
    expect(
      await new DrizzleRegisterFiscalPointsOfSale(db).fiscalPointsOfSaleOf(crypto.randomUUID()),
    ).toEqual([]);
  });
});

describe("the restored register orphan lane on a real Postgres", () => {
  describe("the requests without a recorded sale", () => {
    it("gives an authorized request whose sale is not recorded, with what it recorded", async () => {
      const request = await recordRequest(7, {
        ...AUTHORIZED,
        issuedOn: "2026-10-05",
        total: 12_500,
        buyerTaxStatusCode: 5,
      });

      const found = await inLane(7, (lane) => lane.requestsWithoutRecordedSale());

      expect(found).toContainEqual({
        fiscalDocumentId: request.fiscalDocumentId,
        saleId: request.saleId,
        number: request.number,
        issuedOn: "2026-10-05",
        total: 12_500,
        buyerTaxStatusCode: 5,
        outcome: {
          answer: {
            kind: "authorized",
            authorizationCode: "74123456789012",
            authorizationCodeDueOn: "2026-10-16",
          },
          decision: null,
        },
      });
    });

    it("gives a request whose authorization was adopted after an unclear answer", async () => {
      const request = await recordRequest(7, {
        answerKind: "unclear",
        unclearCodes: [],
        answeredAt: RECEIVED_AT,
        decision: "adopted",
        adoptedAuthorizationCode: "75123456789012",
        adoptedAuthorizationCodeDueOn: "2026-10-17",
        decidedAt: OPENED_AT,
      });

      const found = await inLane(7, (lane) => lane.requestsWithoutRecordedSale());

      expect(found.find(({ number }) => number === request.number)?.outcome).toEqual({
        answer: { kind: "unclear" },
        decision: {
          kind: "adopted",
          authorizationCode: "75123456789012",
          authorizationCodeDueOn: "2026-10-17",
        },
      });
    });

    it("leaves out a request whose sale is recorded", async () => {
      const request = await recordRequest(7, AUTHORIZED);
      await insertRecordedSale(db, {
        saleId: request.saleId,
        registerId,
        at: RECEIVED_AT,
      });

      const found = await inLane(7, (lane) => lane.requestsWithoutRecordedSale());

      expect(found.map(({ number }) => number)).not.toContain(request.number);
    });

    it("leaves out a request whose sale's completion was received and is not applied yet", async () => {
      const request = await recordRequest(7, AUTHORIZED);
      await insertInboxEvent(db, deviceId, { aggregateId: request.saleId });

      const found = await inLane(7, (lane) => lane.requestsWithoutRecordedSale());

      expect(found.map(({ number }) => number)).not.toContain(request.number);
    });

    it("leaves out a request whose sale's completion was received and quarantined", async () => {
      const request = await recordRequest(7, AUTHORIZED);
      await insertQuarantinedEvent(db, deviceId, { aggregateId: request.saleId });

      const found = await inLane(7, (lane) => lane.requestsWithoutRecordedSale());

      expect(found.map(({ number }) => number)).not.toContain(request.number);
    });

    it("gives a request whose sale received only another of its events", async () => {
      const request = await recordRequest(7, AUTHORIZED);
      await insertInboxEvent(db, deviceId, {
        aggregateId: request.saleId,
        eventType: "sale_print_state_changed",
      });

      const found = await inLane(7, (lane) => lane.requestsWithoutRecordedSale());

      expect(found.map(({ number }) => number)).toContain(request.number);
    });

    it.each([
      [
        "rejected",
        {
          answerKind: "rejected",
          rejectionCodes: [10015],
          rejectionClass: "content",
          answeredAt: RECEIVED_AT,
        },
      ],
      [
        "unclear and not decided",
        { answerKind: "unclear", unclearCodes: [], answeredAt: RECEIVED_AT },
      ],
      [
        "unclear and released",
        {
          answerKind: "unclear",
          unclearCodes: [],
          answeredAt: RECEIVED_AT,
          decision: "released",
          decidedAt: OPENED_AT,
        },
      ],
      ["not answered", {}],
    ] satisfies [string, Partial<typeof fiscalRequests.$inferInsert>][])(
      "gives a request that is %s too",
      async (_case, columns) => {
        const request = await recordRequest(7, columns);

        const found = await inLane(7, (lane) => lane.requestsWithoutRecordedSale());

        expect(found.map(({ number }) => number)).toContain(request.number);
      },
    );

    it("gives only the requests of its own point of sale", async () => {
      const other = await recordRequest(8, AUTHORIZED, otherRegisterId);

      const found = await inLane(7, (lane) => lane.requestsWithoutRecordedSale());

      expect(found.map(({ fiscalDocumentId }) => fiscalDocumentId)).not.toContain(
        other.fiscalDocumentId,
      );
    });
  });

  describe("the freeze", () => {
    it("holds no freeze until the point of sale is frozen, and then its count and time", async () => {
      expect(await inLane(8, (lane) => lane.numberingFreeze())).toBeNull();
      await db
        .insert(numberingFreezes)
        .values({ pointOfSaleNumber: 8, countBeforeFreeze: 4, frozenAt: RECEIVED_AT });

      expect(await inLane(8, (lane) => lane.numberingFreeze())).toEqual({
        countBeforeFreeze: 4,
        frozenAt: RECEIVED_AT,
      });
      expect(await inLane(7, (lane) => lane.numberingFreeze())).toBeNull();
    });
  });

  describe("the local standing", () => {
    it("tells a number already regularized from one that is not", async () => {
      const request = await recordRequest(7, AUTHORIZED);
      expect(
        await inLane(7, (lane) =>
          lane.requestsAtNumber({ pointOfSale: 7, number: request.number }),
        ),
      ).toMatchObject({ kind: "requests" });

      await inLane(7, (lane) =>
        lane.recordOrphanRegularization(
          externalInvoicingRegularization({ pointOfSale: 7, number: request.number }),
        ),
      );

      expect(
        await inLane(7, (lane) =>
          lane.requestsAtNumber({ pointOfSale: 7, number: request.number }),
        ),
      ).toEqual({ kind: "already_regularized" });
    });

    it("gives the other documents of a sale, leaving out the one it is asked about", async () => {
      const request = await recordRequest(7, AUTHORIZED);
      await insertOfflineFiscalDocument(db, {
        registerId,
        saleId: request.saleId,
        pointOfSale: 9,
        fortnight: { start: "2026-10-01", end: "2026-10-15" },
        number: 3,
      });

      expect(
        await inLane(7, (lane) =>
          lane.otherDocumentsOfSale(request.saleId, request.fiscalDocumentId),
        ),
      ).toEqual([
        {
          kind: "offline",
          voucher: { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale: 9, number: 3 },
        },
      ]);
    });
  });

  describe("the credit notes of a sale", () => {
    it("gives each credit note of the sale with the voucher it credited and the one it kept", async () => {
      const regularization = creditNoteRegularization({
        associatedVoucher: { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale: 7, number: 90_101 },
        keptVoucher: { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale: 7, number: 90_102 },
      });
      await inLane(7, (lane) => lane.recordOrphanRegularization(regularization));
      await inLane(7, (lane) =>
        lane.recordOrphanRegularization(
          creditNoteRegularization({
            associatedVoucher: {
              voucherType: FACTURA_C_VOUCHER_TYPE,
              pointOfSale: 7,
              number: 90_103,
            },
          }),
        ),
      );

      expect(await inLane(7, (lane) => lane.creditNotesOfSale(regularization.saleId))).toEqual([
        {
          creditedVoucher: { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale: 7, number: 90_101 },
          keptVoucher: { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale: 7, number: 90_102 },
        },
      ]);
    });

    it("gives a credit note that kept no voucher with none kept", async () => {
      const saleId = crypto.randomUUID();
      await insertSaleVoidCreditNote(db, registerId, saleId, {
        associatedPointOfSale: 7,
        associatedNumber: 90_104,
      });

      expect(await inLane(7, (lane) => lane.creditNotesOfSale(saleId))).toEqual([
        {
          creditedVoucher: { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale: 7, number: 90_104 },
          keptVoucher: null,
        },
      ]);
    });
  });

  describe("recording a regularization", () => {
    it("requests the credit note and enqueues it", async () => {
      const regularization = creditNoteRegularization({
        associatedVoucher: { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale: 7, number: 90_001 },
      });

      await inLane(7, (lane) => lane.recordOrphanRegularization(regularization));

      const rows = await db.select().from(creditNotes);
      expect(rows.map(({ id }) => id)).toContain(regularization.creditNoteId);
      expect(creditNotesEnqueued).toContain(regularization.creditNoteId);
    });

    it("opens the alert and the task for a person", async () => {
      await inLane(7, (lane) =>
        lane.recordOrphanRegularization(
          externalInvoicingRegularization({ pointOfSale: 7, number: 90_002 }),
        ),
      );

      expect((await db.select().from(fiscalTasks)).map(({ number }) => number)).toContain(90_002);
      expect((await db.select().from(alerts)).length).toBeGreaterThan(0);
    });
  });
});
