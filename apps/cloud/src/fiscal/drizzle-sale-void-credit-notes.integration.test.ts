import {
  CreditNoteIdTaken,
  type SaleCreditNoteLane,
  VoucherAlreadyCredited,
} from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  creditNotes,
  pointOfSaleClaims,
  registers,
  saleVoidCreditNoteRefusals,
  users,
} from "../platform/db/schema.js";
import { postgresDedicatedConnections } from "../platform/dedicated-connections.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleSaleCreditNoteLanes } from "./drizzle-sale-void-credit-notes.js";
import { insertRegisterWithPointOfSale } from "./test-support/authorization-request-fixtures.js";
import { insertRealTimeInvoice } from "./test-support/held-invoice-fixtures.js";
import {
  insertOfflineCreditNote,
  insertOfflineFiscalDocument,
} from "./test-support/offline-fiscal-document-fixtures.js";
import {
  anAuthorizedAnswer,
  aRejectedAnswer,
  insertSaleVoidCreditNote,
} from "./test-support/sale-void-credit-notes.js";

const RECEIVED_AT = new Date("2026-10-08T01:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let registerId: string;
let enqueued: string[];

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("sale_void_credit_notes");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
  registerId = await insertRegisterWithPointOfSale(db, { pointOfSaleNumber: 7, name: "caja-1" });
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function inLane<TOutcome>(work: (lane: SaleCreditNoteLane) => Promise<TOutcome>) {
  enqueued = [];
  return new DrizzleSaleCreditNoteLanes(
    postgresDedicatedConnections(sql),
    async (_transaction, creditNoteId) => {
      enqueued.push(creditNoteId);
    },
  ).inPointOfSaleLane(7, work);
}

function aRecord(creditNoteId = crypto.randomUUID(), number = 42) {
  return {
    creditNoteId,
    registerId,
    saleId: crypto.randomUUID(),
    pointOfSale: 7,
    correctedVoucher: { voucherType: 11, pointOfSale: 31, number },
    total: 12_500,
    receiverTaxStatusCode: 5,
    origin: { kind: "sale_void" as const },
    receivedAt: RECEIVED_AT,
  };
}

function inLaneOf<TOutcome>(
  pointOfSale: number,
  work: (lane: SaleCreditNoteLane) => Promise<TOutcome>,
) {
  return new DrizzleSaleCreditNoteLanes(
    postgresDedicatedConnections(sql),
    async () => {},
  ).inPointOfSaleLane(pointOfSale, work);
}

describe("the credit notes of voided sales on a real Postgres", () => {
  it("tells that a register owns the point of sale it holds now and no other", async () => {
    expect(await inLane((lane) => lane.registerOwnsPointOfSale(registerId, 7))).toBe(true);
    expect(await inLane((lane) => lane.registerOwnsPointOfSale(registerId, 8))).toBe(false);
    expect(await inLane((lane) => lane.registerOwnsPointOfSale(crypto.randomUUID(), 7))).toBe(
      false,
    );
  });

  it("tells that a register issues from a point of sale it claimed, whichever the mechanism, and from no other", async () => {
    const [actor] = await db.select({ id: users.id }).from(users).limit(1);
    await db.insert(pointOfSaleClaims).values({
      pointOfSaleNumber: 31,
      registerId,
      mechanism: "offline",
      claimedBy: actor?.id ?? "",
    });
    const [other] = await db
      .insert(registers)
      .values({ locationId: await seededLocationId(db), name: "caja-2" })
      .returning({ id: registers.id });

    expect(await inLane((lane) => lane.registerIssuesFromPointOfSale(registerId, 31))).toBe(true);
    expect(await inLane((lane) => lane.registerIssuesFromPointOfSale(registerId, 7))).toBe(true);
    expect(await inLane((lane) => lane.registerIssuesFromPointOfSale(registerId, 99))).toBe(false);
    expect(await inLane((lane) => lane.registerIssuesFromPointOfSale(other?.id ?? "", 31))).toBe(
      false,
    );
  });

  it("reads nothing of a credit note that was never recorded", async () => {
    expect(
      await inLane((lane) => lane.recordedCreditNote(registerId, crypto.randomUUID())),
    ).toBeNull();
  });

  it("reads nothing of a credit note another register recorded, and refuses to record another under its id", async () => {
    const record = aRecord(undefined, 80);
    await inLane((lane) => lane.recordSaleCreditNote(record));
    const otherRegisterId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 9,
      name: "caja-3",
    });

    expect(
      await inLane((lane) => lane.recordedCreditNote(otherRegisterId, record.creditNoteId)),
    ).toBeNull();
    await expect(
      inLane((lane) =>
        lane.recordSaleCreditNote({
          ...aRecord(record.creditNoteId, 81),
          registerId: otherRegisterId,
        }),
      ),
    ).rejects.toBeInstanceOf(CreditNoteIdTaken);
    expect(
      await db
        .select({ registerId: creditNotes.registerId })
        .from(creditNotes)
        .where(eq(creditNotes.id, record.creditNoteId)),
    ).toEqual([{ registerId }]);
  });

  it("records a credit note of a voided sale, not yet requested, and asks for it to be issued in the same transaction", async () => {
    const record = aRecord();

    await inLane((lane) => lane.recordSaleCreditNote(record));

    expect(enqueued).toEqual([record.creditNoteId]);
    const [row] = await db
      .select()
      .from(creditNotes)
      .where(eq(creditNotes.id, record.creditNoteId));
    expect(row).toMatchObject({
      registerId,
      saleId: record.saleId,
      pointOfSale: 7,
      reason: "sale_void",
      associatedVoucherType: 11,
      associatedPointOfSale: 31,
      associatedNumber: 42,
      keptVoucherType: null,
      keptPointOfSale: null,
      keptNumber: null,
      total: 12_500,
      receiverTaxStatusCode: 5,
      number: null,
      createdAt: RECEIVED_AT,
    });
    expect(
      await inLane((lane) => lane.recordedCreditNote(registerId, record.creditNoteId)),
    ).toEqual({
      creditNoteId: record.creditNoteId,
      pointOfSale: 7,
      associatedVoucher: { voucherType: 11, pointOfSale: 31, number: 42 },
      total: 12_500,
      receiverTaxStatusCode: 5,
      reason: "sale_void",
      issueOn: null,
      standing: { kind: "not_requested" },
    });
    expect(row).toMatchObject({ returnId: null, issueOn: null });
  });

  it("records the credit note of a return with the return it answers and the day it is issued on", async () => {
    const returnId = crypto.randomUUID();
    const record = {
      ...aRecord(undefined, 55),
      origin: { kind: "sale_return" as const, returnId, issuedOn: "2026-10-07" },
    };

    await inLane((lane) => lane.recordSaleCreditNote(record));

    const [row] = await db
      .select()
      .from(creditNotes)
      .where(eq(creditNotes.id, record.creditNoteId));
    expect(row).toMatchObject({ reason: "sale_return", returnId, issueOn: "2026-10-07" });
    expect(enqueued).toEqual([record.creditNoteId]);
    expect(
      await inLane((lane) => lane.recordedCreditNote(registerId, record.creditNoteId)),
    ).toMatchObject({ reason: "sale_return", issueOn: "2026-10-07" });
  });

  describe("the total of the invoice a voucher names", () => {
    it("is the total of an invoice the tax authority authorized in real time", async () => {
      await insertRealTimeInvoice(db, { registerId, pointOfSale: 31, number: 301, total: 9_000 });

      expect(
        await inLane((lane) =>
          lane.invoiceTotalOf({ voucherType: 11, pointOfSale: 31, number: 301 }),
        ),
      ).toBe(9_000);
    });

    it("is the total of an invoice issued offline", async () => {
      await insertOfflineFiscalDocument(db, {
        registerId,
        pointOfSale: 31,
        fortnight: { start: "2026-10-01", end: "2026-10-15" },
        number: 302,
      });

      expect(
        await inLane((lane) =>
          lane.invoiceTotalOf({ voucherType: 11, pointOfSale: 31, number: 302 }),
        ),
      ).toBe(10_000);
    });

    it("is the total of an invoice whose unclear outcome ended with the authorization being adopted", async () => {
      await insertRealTimeInvoice(db, {
        registerId,
        pointOfSale: 31,
        number: 303,
        total: 4_000,
        answer: { answerKind: "unclear", adoptedAuthorizationCode: "74123456789013" },
      });

      expect(
        await inLane((lane) =>
          lane.invoiceTotalOf({ voucherType: 11, pointOfSale: 31, number: 303 }),
        ),
      ).toBe(4_000);
    });

    it("is unknown for an invoice the cloud does not hold, one rejected and one whose outcome is still unclear", async () => {
      await insertRealTimeInvoice(db, {
        registerId,
        pointOfSale: 31,
        number: 304,
        total: 4_000,
        answer: { answerKind: "rejected" },
      });
      await insertRealTimeInvoice(db, {
        registerId,
        pointOfSale: 31,
        number: 305,
        total: 4_000,
        answer: { answerKind: "unclear" },
      });

      for (const number of [304, 305, 306]) {
        expect(
          await inLane((lane) => lane.invoiceTotalOf({ voucherType: 11, pointOfSale: 31, number })),
        ).toBeNull();
      }
    });
  });

  describe("what is credited to an invoice", () => {
    const voucher = (number: number) => ({ voucherType: 11, pointOfSale: 31, number });
    const creditedTo = (number: number) => ({
      associatedNumber: number,
      saleId: crypto.randomUUID(),
    });

    it("is nothing for an invoice without credit notes", async () => {
      expect(await inLane((lane) => lane.creditedToInvoice(voucher(400)))).toBe(0);
    });

    it("adds the credit notes of the invoice, whatever asked for them, and those issued offline", async () => {
      await insertSaleVoidCreditNote(db, registerId, crypto.randomUUID(), {
        ...creditedTo(401),
        total: 3_000,
      });
      await insertSaleVoidCreditNote(db, registerId, crypto.randomUUID(), {
        ...creditedTo(401),
        reason: "sale_return",
        total: 2_000,
        ...anAuthorizedAnswer(),
      });
      await insertOfflineCreditNote(db, {
        registerId,
        pointOfSale: 7,
        fortnight: { start: "2026-10-01", end: "2026-10-15" },
        number: 2,
        corrects: voucher(401),
      });
      await insertSaleVoidCreditNote(db, registerId, crypto.randomUUID(), {
        ...creditedTo(402),
        total: 700,
      });

      expect(await inLane((lane) => lane.creditedToInvoice(voucher(401)))).toBe(15_000);
    });

    it("leaves out the credit notes the tax authority rejected and those that could not be issued", async () => {
      await insertSaleVoidCreditNote(db, registerId, crypto.randomUUID(), {
        ...creditedTo(403),
        total: 1_000,
      });
      await insertSaleVoidCreditNote(db, registerId, crypto.randomUUID(), {
        ...creditedTo(403),
        total: 2_000,
        ...aRejectedAnswer(),
      });
      await insertSaleVoidCreditNote(db, registerId, crypto.randomUUID(), {
        ...creditedTo(403),
        reason: "sale_return",
        total: 4_000,
        answerKind: "regularization_required",
        answeredAt: RECEIVED_AT,
      });

      expect(await inLane((lane) => lane.creditedToInvoice(voucher(403)))).toBe(1_000);
    });
  });

  it("refuses a credit note that takes the credits of an invoice over its total, keeping nothing of it", async () => {
    await insertRealTimeInvoice(db, { registerId, pointOfSale: 31, number: 50, total: 12_500 });
    await inLane((lane) => lane.recordSaleCreditNote(aRecord(undefined, 50)));
    const again = aRecord(undefined, 50);

    await expect(inLane((lane) => lane.recordSaleCreditNote(again))).rejects.toBeInstanceOf(
      VoucherAlreadyCredited,
    );

    expect(enqueued).toEqual([]);
    expect(
      await db.select().from(creditNotes).where(eq(creditNotes.id, again.creditNoteId)),
    ).toEqual([]);
  });

  it("records several credit notes of one invoice while they stay within its total", async () => {
    await insertRealTimeInvoice(db, { registerId, pointOfSale: 31, number: 51, total: 12_500 });
    const first = { ...aRecord(undefined, 51), total: 5_000 };
    const second = { ...aRecord(undefined, 51), total: 7_500 };
    const third = { ...aRecord(undefined, 51), total: 1 };

    await inLane((lane) => lane.recordSaleCreditNote(first));
    await inLane((lane) => lane.recordSaleCreditNote(second));
    await expect(inLane((lane) => lane.recordSaleCreditNote(third))).rejects.toBeInstanceOf(
      VoucherAlreadyCredited,
    );

    expect(
      await db
        .select({ id: creditNotes.id })
        .from(creditNotes)
        .where(eq(creditNotes.associatedNumber, 51)),
    ).toHaveLength(2);
  });

  it("records the credit notes of an invoice the cloud does not hold", async () => {
    await inLane((lane) => lane.recordSaleCreditNote(aRecord(undefined, 52)));

    await inLane((lane) => lane.recordSaleCreditNote(aRecord(undefined, 52)));

    expect(
      await db
        .select({ id: creditNotes.id })
        .from(creditNotes)
        .where(eq(creditNotes.associatedNumber, 52)),
    ).toHaveLength(2);
  });

  it("refuses a credit note that, with one issued offline, goes over the invoice's total, keeping nothing of it", async () => {
    await insertRealTimeInvoice(db, { registerId, pointOfSale: 31, number: 90, total: 12_500 });
    await insertOfflineCreditNote(db, {
      registerId,
      pointOfSale: 7,
      fortnight: { start: "2026-10-01", end: "2026-10-15" },
      number: 1,
      corrects: { voucherType: 11, pointOfSale: 31, number: 90 },
    });
    const asked = aRecord(undefined, 90);

    await expect(inLane((lane) => lane.recordSaleCreditNote(asked))).rejects.toBeInstanceOf(
      VoucherAlreadyCredited,
    );

    expect(enqueued).toEqual([]);
    expect(
      await db.select().from(creditNotes).where(eq(creditNotes.id, asked.creditNoteId)),
    ).toEqual([]);
  });

  it("refuses a credit note that, with an orphan credit note, goes over the invoice's total", async () => {
    await insertRealTimeInvoice(db, { registerId, pointOfSale: 31, number: 60, total: 12_500 });
    await db.insert(creditNotes).values({
      id: crypto.randomUUID(),
      registerId,
      saleId: crypto.randomUUID(),
      pointOfSale: 7,
      reason: "orphan",
      associatedVoucherType: 11,
      associatedPointOfSale: 31,
      associatedNumber: 60,
      keptVoucherType: 11,
      keptPointOfSale: 31,
      keptNumber: 61,
      total: 12_500,
      receiverTaxStatusCode: 5,
      createdAt: RECEIVED_AT,
    });

    await expect(
      inLane((lane) => lane.recordSaleCreditNote(aRecord(undefined, 60))),
    ).rejects.toBeInstanceOf(VoucherAlreadyCredited);
  });

  it("lets only as many racing credit notes through as the invoice's total holds", async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const number = 700 + attempt;
      await insertRealTimeInvoice(db, { registerId, pointOfSale: 31, number, total: 10_000 });
      const racing = [7, 8].map((pointOfSale) => ({
        ...aRecord(undefined, number),
        pointOfSale,
        total: 6_000,
      }));

      const outcomes = await Promise.all(
        racing.map((record) =>
          inLaneOf(record.pointOfSale, (lane) => lane.recordSaleCreditNote(record)).then(
            () => "recorded" as const,
            (error: unknown) => (error instanceof VoucherAlreadyCredited ? "refused" : error),
          ),
        ),
      );

      expect([...outcomes].sort()).toEqual(["recorded", "refused"]);
      expect(
        await db
          .select({ id: creditNotes.id })
          .from(creditNotes)
          .where(eq(creditNotes.associatedNumber, number)),
      ).toHaveLength(1);
    }
  });

  it("does not keep the credit note when asking for it to be issued fails", async () => {
    const record = aRecord(undefined, 70);
    const lanes = new DrizzleSaleCreditNoteLanes(postgresDedicatedConnections(sql), async () => {
      throw new Error("the queue broke");
    });

    await expect(
      lanes.inPointOfSaleLane(7, (lane) => lane.recordSaleCreditNote(record)),
    ).rejects.toThrow("the queue broke");

    expect(
      await db.select().from(creditNotes).where(eq(creditNotes.id, record.creditNoteId)),
    ).toEqual([]);
  });

  it("keeps the refusal of a credit note under its id, with the register, the sale and when it was refused", async () => {
    const creditNoteId = crypto.randomUUID();
    const saleId = crypto.randomUUID();

    await inLane((lane) =>
      lane.keepAlreadyCreditedRefusal({ creditNoteId, registerId, saleId }, RECEIVED_AT),
    );

    expect(
      await db
        .select()
        .from(saleVoidCreditNoteRefusals)
        .where(eq(saleVoidCreditNoteRefusals.creditNoteId, creditNoteId)),
    ).toEqual([{ creditNoteId, registerId, saleId, refusedAt: RECEIVED_AT }]);
  });

  it("keeps the first refusal of a credit note when it is refused again", async () => {
    const creditNoteId = crypto.randomUUID();
    const saleId = crypto.randomUUID();
    const later = new Date("2026-10-09T01:00:00.000Z");
    await inLane((lane) =>
      lane.keepAlreadyCreditedRefusal({ creditNoteId, registerId, saleId }, RECEIVED_AT),
    );

    await inLane((lane) =>
      lane.keepAlreadyCreditedRefusal({ creditNoteId, registerId, saleId }, later),
    );

    expect(
      await db
        .select({ refusedAt: saleVoidCreditNoteRefusals.refusedAt })
        .from(saleVoidCreditNoteRefusals)
        .where(eq(saleVoidCreditNoteRefusals.creditNoteId, creditNoteId)),
    ).toEqual([{ refusedAt: RECEIVED_AT }]);
  });
});
