import {
  type CreditNoteLane,
  CreditNoteNumberTaken,
  type FiscalTask,
  type TaxAuthorityRejection,
} from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { alerts, creditNotes, fiscalTasks } from "../platform/db/schema.js";
import { postgresDedicatedConnections } from "../platform/dedicated-connections.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzleCreditNoteLanes, DrizzleCreditNoteRequests } from "./drizzle-credit-notes.js";
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

function inLane<TOutcome>(work: (lane: CreditNoteLane) => Promise<TOutcome>, pointOfSale = 7) {
  return new DrizzleCreditNoteLanes(postgresDedicatedConnections(sql)).inPointOfSaleLane(
    pointOfSale,
    work,
  );
}

async function aCreditNote(pointOfSale = 7): Promise<string> {
  seeded += 1;
  const id = crypto.randomUUID();
  await db.insert(creditNotes).values({
    id,
    registerId,
    saleId: crypto.randomUUID(),
    pointOfSale,
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
  const [row] = await db.select().from(creditNotes).where(eq(creditNotes.id, creditNoteId));
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
    const requests = new DrizzleCreditNoteRequests(db);

    expect(await requests.pointOfSaleOf(id)).toBe(7);
    expect(await requests.pointOfSaleOf(crypto.randomUUID())).toBeNull();
  });

  it("reads nothing of a credit note it does not hold", async () => {
    expect(await inLane((lane) => lane.creditNote(crypto.randomUUID()))).toBeNull();
  });

  it("reads a credit note not yet requested with the orphan it cancels and the total it carries", async () => {
    const id = await aCreditNote();

    expect(await inLane((lane) => lane.creditNote(id))).toEqual({
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

    expect((await inLane((lane) => lane.creditNote(id)))?.standing).toEqual({
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

    expect((await inLane((lane) => lane.creditNote(id)))?.standing).toMatchObject({
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

    expect((await inLane((lane) => lane.creditNote(id)))?.standing).toEqual({
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

    expect((await inLane((lane) => lane.creditNote(id)))?.standing).toEqual({
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

      expect((await inLane((lane) => lane.creditNote(id)))?.standing).toEqual({
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
        creditNoteId: id,
        reason: { rejections },
        state: "open",
        createdAt: ANSWERED_AT,
      });
    });

    it("opens a task for each credit note rejected at the same number, naming its own credit note", async () => {
      const first = await aCreditNote();
      const second = await aCreditNote();
      for (const creditNoteId of [first, second]) {
        await inLane(async (lane) => {
          await lane.recordCreditNoteRequest({
            creditNoteId,
            number: 40,
            issuedOn: "2026-10-07",
            requestedAt: REQUESTED_AT,
          });
          await lane.recordCreditNoteRejected({
            creditNoteId,
            rejections,
            rejectedAt: ANSWERED_AT,
            task: rejectedTask(creditNoteId, 40, rejections),
          });
        });
      }

      expect(
        (await db.select().from(fiscalTasks))
          .filter((row) => row.kind === "credit_note_rejected" && row.number === 40)
          .map((row) => row.creditNoteId)
          .sort(),
      ).toEqual([first, second].sort());
    });

    it("opens one task when the same rejection is recorded again", async () => {
      const id = await aCreditNote();
      await inLane((lane) =>
        lane.recordCreditNoteRequest({
          creditNoteId: id,
          number: 41,
          issuedOn: "2026-10-07",
          requestedAt: REQUESTED_AT,
        }),
      );
      const rejection = {
        creditNoteId: id,
        rejections,
        rejectedAt: ANSWERED_AT,
        task: rejectedTask(id, 41, rejections),
      };

      await inLane((lane) => lane.recordCreditNoteRejected(rejection));
      await inLane((lane) => lane.recordCreditNoteRejected(rejection));

      expect(
        (await db.select().from(fiscalTasks)).filter((row) => row.creditNoteId === id),
      ).toHaveLength(1);
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

      expect((await inLane((lane) => lane.creditNote(id)))?.standing).toMatchObject({
        kind: "requested",
      });
    });
  });

  describe("holding a number", () => {
    const request = (lane: CreditNoteLane, creditNoteId: string, number: number) =>
      lane.recordCreditNoteRequest({
        creditNoteId,
        number,
        issuedOn: "2026-10-07",
        requestedAt: REQUESTED_AT,
      });

    it("leaves the number of a rejected credit note to the next one, since the tax authority did not take it", async () => {
      const rejected = await aCreditNote();
      const next = await aCreditNote();
      const rejections = [{ code: 10015, message: "invalid receiver" }];
      await inLane(async (lane) => {
        await request(lane, rejected, 30);
        await lane.recordCreditNoteRejected({
          creditNoteId: rejected,
          rejections,
          rejectedAt: ANSWERED_AT,
          task: rejectedTask(rejected, 30, rejections),
        });
        await request(lane, next, 30);
      });

      expect((await inLane((lane) => lane.creditNote(next)))?.standing).toMatchObject({
        kind: "requested",
        number: 30,
      });
      expect(await rowOf(rejected)).toMatchObject({ answerKind: "rejected", number: 30 });
    });

    it.each<[string, (lane: CreditNoteLane, creditNoteId: string) => Promise<void>]>([
      ["awaits its answer", async () => {}],
      [
        "was left unclear",
        (lane, creditNoteId) => lane.recordCreditNoteUnclear(creditNoteId, ANSWERED_AT),
      ],
      [
        "was authorized",
        (lane, creditNoteId) =>
          lane.recordCreditNoteAuthorized({
            creditNoteId,
            authorizationCode: "75123456789099",
            authorizationCodeDueOn: "2026-10-17",
            authorizedAt: ANSWERED_AT,
          }),
      ],
    ])(
      "refuses as taken a number another credit note of the point of sale holds that %s",
      async (_case, answer) => {
        seeded += 1;
        const number = 1_000 + seeded;
        const holder = await aCreditNote();
        const next = await aCreditNote();
        await inLane(async (lane) => {
          await request(lane, holder, number);
          await answer(lane, holder);
        });

        await expect(inLane((lane) => request(lane, next, number))).rejects.toBeInstanceOf(
          CreditNoteNumberTaken,
        );
        expect((await inLane((lane) => lane.creditNote(next)))?.standing).toEqual({
          kind: "not_requested",
        });
      },
    );

    it("lets another point of sale hold the same number", async () => {
      const here = await aCreditNote();
      const there = await aCreditNote(8);
      await inLane((lane) => request(lane, here, 40));

      await inLane((lane) => request(lane, there, 40), 8);

      expect((await inLane((lane) => lane.creditNote(there), 8))?.standing).toMatchObject({
        kind: "requested",
        number: 40,
      });
    });
  });

  describe("the other credit notes of the point of sale", () => {
    it("are the standings of every other credit note of the lane's point of sale", async () => {
      const asked = await aCreditNote(9);
      const requested = await aCreditNote(9);
      await aCreditNote(9);
      await aCreditNote(10);
      await inLane(async (lane) => {
        await lane.recordCreditNoteRequest({
          creditNoteId: requested,
          number: 3,
          issuedOn: "2026-10-07",
          requestedAt: REQUESTED_AT,
        });
      }, 9);

      const standings = await inLane((lane) => lane.otherCreditNoteStandings(asked), 9);

      expect(standings).toHaveLength(2);
      expect(standings).toEqual(
        expect.arrayContaining([
          { kind: "not_requested" },
          {
            kind: "requested",
            number: 3,
            issuedOn: "2026-10-07",
            requestedAt: REQUESTED_AT,
            unclearAnsweredAt: null,
          },
        ]),
      );
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

      expect((await inLane((lane) => lane.creditNote(first)))?.standing).toEqual({
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

      expect((await inLane((lane) => lane.creditNote(id)))?.standing).toEqual({
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

      expect((await inLane((lane) => lane.creditNote(id)))?.standing).toMatchObject({
        kind: "requested",
        number: 22,
      });
      expect(
        (await db.select().from(alerts)).filter((row) => row.scope === "7:credit_note_c:22"),
      ).toEqual([]);
    });
  });
});
