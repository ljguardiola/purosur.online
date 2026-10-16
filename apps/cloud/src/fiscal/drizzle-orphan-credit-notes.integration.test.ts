import type {
  FiscalTask,
  OrphanCreditNoteLane,
  TaxAuthorityRejection,
} from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { alerts, fiscalTasks, orphanCreditNotes } from "../platform/db/schema.js";
import { postgresDedicatedConnections } from "../platform/dedicated-connections.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import {
  DrizzleOrphanCreditNoteLanes,
  DrizzleOrphanCreditNoteRequests,
} from "./drizzle-orphan-credit-notes.js";
import { insertRegisterWithPointOfSale } from "./test-support/authorization-request-fixtures.js";
import {
  externalInvoicingRegularization,
  OPENED_AT,
} from "./test-support/orphan-regularization-fixtures.js";

const REQUESTED_AT = new Date("2026-10-08T01:00:00.000Z");
const ANSWERED_AT = new Date("2026-10-08T01:00:03.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let registerId: string;
let seeded = 0;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("orphan_credit_notes");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
  registerId = await insertRegisterWithPointOfSale(db, { pointOfSaleNumber: 7, name: "caja-1" });
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function inLane<TOutcome>(work: (lane: OrphanCreditNoteLane) => Promise<TOutcome>) {
  return new DrizzleOrphanCreditNoteLanes(postgresDedicatedConnections(sql)).inPointOfSaleLane(
    7,
    work,
  );
}

async function aCreditNote(): Promise<string> {
  seeded += 1;
  const id = crypto.randomUUID();
  await db.insert(orphanCreditNotes).values({
    id,
    registerId,
    saleId: crypto.randomUUID(),
    pointOfSale: 7,
    associatedVoucherType: 11,
    associatedNumber: 100 + seeded,
    keptVoucherType: 11,
    keptPointOfSale: 31,
    keptNumber: seeded,
    total: 12_500,
    receiverTaxStatusCode: 5,
    createdAt: OPENED_AT,
  });
  return id;
}

function rejectedTask(
  creditNoteId: string,
  number: number,
  rejections: readonly TaxAuthorityRejection[],
): FiscalTask {
  return {
    kind: "credit_note_rejected",
    state: "open",
    pointOfSale: 7,
    documentType: "credit_note_c",
    number,
    creditNoteId,
    rejections,
    createdAt: ANSWERED_AT,
  };
}

async function rowOf(creditNoteId: string) {
  const [row] = await db
    .select()
    .from(orphanCreditNotes)
    .where(eq(orphanCreditNotes.id, creditNoteId));
  return row;
}

async function refusingTaskInserts<T>(work: () => Promise<T>): Promise<void> {
  const admin = postgres(integrationDb.adminDatabaseUrl, { max: 1 });
  await admin.unsafe(`
    create function refuse_fiscal_task() returns trigger language plpgsql as $$
    begin raise exception 'the task broke'; end; $$`);
  await admin.unsafe(`
    create trigger refuse_fiscal_task before insert on fiscal_tasks
    for each row execute function refuse_fiscal_task()`);
  try {
    await expect(work()).rejects.toThrow();
  } finally {
    await admin.unsafe("drop trigger refuse_fiscal_task on fiscal_tasks");
    await admin.unsafe("drop function refuse_fiscal_task()");
    await admin.end({ timeout: 1 });
  }
}

describe("the orphan credit note lanes on a real Postgres", () => {
  it("answers the point of sale of a credit note, and none for one it does not hold", async () => {
    const id = await aCreditNote();
    const requests = new DrizzleOrphanCreditNoteRequests(db);

    expect(await requests.pointOfSaleOf(id)).toBe(7);
    expect(await requests.pointOfSaleOf(crypto.randomUUID())).toBeNull();
  });

  it("reads nothing of a credit note it does not hold", async () => {
    expect(await inLane((lane) => lane.orphanCreditNote(crypto.randomUUID()))).toBeNull();
  });

  it("reads a credit note not yet requested with the orphan it cancels and the total it carries", async () => {
    const id = await aCreditNote();

    expect(await inLane((lane) => lane.orphanCreditNote(id))).toEqual({
      creditNoteId: id,
      pointOfSale: 7,
      associatedVoucher: { voucherType: 11, pointOfSale: 7, number: 100 + seeded },
      total: 12_500,
      receiverTaxStatusCode: 5,
      standing: { kind: "not_requested" },
    });
  });

  it("holds the number, the day and the time of a request, not yet answered", async () => {
    const id = await aCreditNote();

    await inLane((lane) =>
      lane.recordCreditNoteRequest({
        creditNoteId: id,
        number: 5,
        issuedOn: "2026-10-07",
        requestedAt: REQUESTED_AT,
      }),
    );

    expect((await inLane((lane) => lane.orphanCreditNote(id)))?.standing).toEqual({
      kind: "requested",
      number: 5,
      issuedOn: "2026-10-07",
      requestedAt: REQUESTED_AT,
      unclearAnsweredAt: null,
    });
  });

  it("holds the time an unclear answer was given", async () => {
    const id = await aCreditNote();
    await inLane(async (lane) => {
      await lane.recordCreditNoteRequest({
        creditNoteId: id,
        number: 6,
        issuedOn: "2026-10-07",
        requestedAt: REQUESTED_AT,
      });
      await lane.recordCreditNoteUnclear(id, ANSWERED_AT);
    });

    expect((await inLane((lane) => lane.orphanCreditNote(id)))?.standing).toMatchObject({
      kind: "requested",
      number: 6,
      unclearAnsweredAt: ANSWERED_AT,
    });
  });

  it("holds the authorization of a credit note", async () => {
    const id = await aCreditNote();
    await inLane(async (lane) => {
      await lane.recordCreditNoteRequest({
        creditNoteId: id,
        number: 7,
        issuedOn: "2026-10-07",
        requestedAt: REQUESTED_AT,
      });
      await lane.recordCreditNoteAuthorized({
        creditNoteId: id,
        authorizationCode: "74123456789055",
        authorizationCodeDueOn: "2026-10-17",
        authorizedAt: ANSWERED_AT,
      });
    });

    expect((await inLane((lane) => lane.orphanCreditNote(id)))?.standing).toEqual({
      kind: "authorized",
    });
    expect(await rowOf(id)).toMatchObject({
      number: 7,
      answerKind: "authorized",
      answeredAt: ANSWERED_AT,
      authorizationCode: "74123456789055",
      authorizationCodeDueOn: "2026-10-17",
    });
  });

  it("holds an unclear request that is later authorized as authorized", async () => {
    const id = await aCreditNote();
    await inLane(async (lane) => {
      await lane.recordCreditNoteRequest({
        creditNoteId: id,
        number: 8,
        issuedOn: "2026-10-07",
        requestedAt: REQUESTED_AT,
      });
      await lane.recordCreditNoteUnclear(id, ANSWERED_AT);
      await lane.recordCreditNoteAuthorized({
        creditNoteId: id,
        authorizationCode: "74123456789056",
        authorizationCodeDueOn: "2026-10-17",
        authorizedAt: ANSWERED_AT,
      });
    });

    expect((await inLane((lane) => lane.orphanCreditNote(id)))?.standing).toEqual({
      kind: "authorized",
    });
  });

  describe("a rejection", () => {
    const rejections = [{ code: 10015, message: "invalid receiver" }];

    it("is held together with a task for a person naming the rejection", async () => {
      const id = await aCreditNote();
      await inLane(async (lane) => {
        await lane.recordCreditNoteRequest({
          creditNoteId: id,
          number: 9,
          issuedOn: "2026-10-07",
          requestedAt: REQUESTED_AT,
        });
        await lane.recordCreditNoteRejected({
          creditNoteId: id,
          rejections,
          rejectedAt: ANSWERED_AT,
          task: rejectedTask(id, 9, rejections),
        });
      });

      expect((await inLane((lane) => lane.orphanCreditNote(id)))?.standing).toEqual({
        kind: "rejected",
      });
      expect(await rowOf(id)).toMatchObject({
        answerKind: "rejected",
        answeredAt: ANSWERED_AT,
        rejections,
      });
      const [task] = (await db.select().from(fiscalTasks)).filter(
        (row) => row.kind === "credit_note_rejected" && row.number === 9,
      );
      expect(task).toMatchObject({
        registerId,
        pointOfSale: 7,
        documentType: "credit_note_c",
        reason: { creditNoteId: id, rejections },
        state: "open",
        createdAt: ANSWERED_AT,
      });
    });

    it("is not held when the task cannot be opened", async () => {
      const id = await aCreditNote();
      await inLane((lane) =>
        lane.recordCreditNoteRequest({
          creditNoteId: id,
          number: 10,
          issuedOn: "2026-10-07",
          requestedAt: REQUESTED_AT,
        }),
      );

      await refusingTaskInserts(() =>
        inLane((lane) =>
          lane.recordCreditNoteRejected({
            creditNoteId: id,
            rejections,
            rejectedAt: ANSWERED_AT,
            task: rejectedTask(id, 10, rejections),
          }),
        ),
      );

      expect((await inLane((lane) => lane.orphanCreditNote(id)))?.standing).toMatchObject({
        kind: "requested",
      });
    });
  });

  describe("releasing a request", () => {
    it("takes the number back, so another credit note can hold it", async () => {
      const first = await aCreditNote();
      const second = await aCreditNote();
      await inLane(async (lane) => {
        await lane.recordCreditNoteRequest({
          creditNoteId: first,
          number: 20,
          issuedOn: "2026-10-07",
          requestedAt: REQUESTED_AT,
        });
        await lane.recordCreditNoteUnclear(first, ANSWERED_AT);
        await lane.releaseCreditNoteRequest(first, null);
        await lane.recordCreditNoteRequest({
          creditNoteId: second,
          number: 20,
          issuedOn: "2026-10-07",
          requestedAt: REQUESTED_AT,
        });
      });

      expect((await inLane((lane) => lane.orphanCreditNote(first)))?.standing).toEqual({
        kind: "not_requested",
      });
      expect(await rowOf(first)).toMatchObject({
        number: null,
        issuedOn: null,
        requestedAt: null,
        answerKind: null,
        answeredAt: null,
      });
    });

    it("records the voucher another issuer put at the number as invoicing outside the register, together with the release", async () => {
      const id = await aCreditNote();
      await inLane((lane) =>
        lane.recordCreditNoteRequest({
          creditNoteId: id,
          number: 21,
          issuedOn: "2026-10-07",
          requestedAt: REQUESTED_AT,
        }),
      );

      await inLane((lane) =>
        lane.releaseCreditNoteRequest(
          id,
          externalInvoicingRegularization({
            pointOfSale: 7,
            number: 21,
            documentType: "credit_note_c",
          }),
        ),
      );

      expect((await inLane((lane) => lane.orphanCreditNote(id)))?.standing).toEqual({
        kind: "not_requested",
      });
      expect(
        (await db.select().from(fiscalTasks)).filter((row) => row.number === 21),
      ).toMatchObject([
        { kind: "external_invoicing", documentType: "credit_note_c", pointOfSale: 7, registerId },
      ]);
      expect(
        (await db.select().from(alerts)).find((row) => row.scope === "7:credit_note_c:21"),
      ).toMatchObject({
        kind: "external_billing",
        detail: { pointOfSale: 7, documentType: "credit_note_c", number: 21 },
      });
    });

    it("keeps the request when the invoicing outside the register cannot be recorded", async () => {
      const id = await aCreditNote();
      await inLane((lane) =>
        lane.recordCreditNoteRequest({
          creditNoteId: id,
          number: 22,
          issuedOn: "2026-10-07",
          requestedAt: REQUESTED_AT,
        }),
      );

      await refusingTaskInserts(() =>
        inLane((lane) =>
          lane.releaseCreditNoteRequest(
            id,
            externalInvoicingRegularization({
              pointOfSale: 7,
              number: 22,
              documentType: "credit_note_c",
            }),
          ),
        ),
      );

      expect((await inLane((lane) => lane.orphanCreditNote(id)))?.standing).toMatchObject({
        kind: "requested",
        number: 22,
      });
      expect(
        (await db.select().from(alerts)).filter((row) => row.scope === "7:credit_note_c:22"),
      ).toEqual([]);
    });
  });
});
