import {
  CreditNoteIdTaken,
  type SaleVoidCreditNoteLane,
  VoucherAlreadyCredited,
} from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creditNotes, pointOfSaleClaims, registers, users } from "../platform/db/schema.js";
import { postgresDedicatedConnections } from "../platform/dedicated-connections.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleSaleVoidCreditNoteLanes } from "./drizzle-sale-void-credit-notes.js";
import { insertRegisterWithPointOfSale } from "./test-support/authorization-request-fixtures.js";

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

function inLane<TOutcome>(work: (lane: SaleVoidCreditNoteLane) => Promise<TOutcome>) {
  enqueued = [];
  return new DrizzleSaleVoidCreditNoteLanes(
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
    receivedAt: RECEIVED_AT,
  };
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
    await inLane((lane) => lane.recordSaleVoidCreditNote(record));
    const otherRegisterId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 9,
      name: "caja-3",
    });

    expect(
      await inLane((lane) => lane.recordedCreditNote(otherRegisterId, record.creditNoteId)),
    ).toBeNull();
    await expect(
      inLane((lane) =>
        lane.recordSaleVoidCreditNote({
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

    await inLane((lane) => lane.recordSaleVoidCreditNote(record));

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
      standing: { kind: "not_requested" },
    });
  });

  it("refuses a second credit note for a voucher that already has one, keeping nothing of it", async () => {
    await inLane((lane) => lane.recordSaleVoidCreditNote(aRecord(undefined, 50)));
    const again = aRecord(undefined, 50);

    await expect(inLane((lane) => lane.recordSaleVoidCreditNote(again))).rejects.toBeInstanceOf(
      VoucherAlreadyCredited,
    );

    expect(enqueued).toEqual([]);
    expect(
      await db.select().from(creditNotes).where(eq(creditNotes.id, again.creditNoteId)),
    ).toEqual([]);
  });

  it("refuses a credit note for a voucher an orphan credit note already corrects", async () => {
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
      inLane((lane) => lane.recordSaleVoidCreditNote(aRecord(undefined, 60))),
    ).rejects.toBeInstanceOf(VoucherAlreadyCredited);
  });

  it("does not keep the credit note when asking for it to be issued fails", async () => {
    const record = aRecord(undefined, 70);
    const lanes = new DrizzleSaleVoidCreditNoteLanes(
      postgresDedicatedConnections(sql),
      async () => {
        throw new Error("the queue broke");
      },
    );

    await expect(
      lanes.inPointOfSaleLane(7, (lane) => lane.recordSaleVoidCreditNote(record)),
    ).rejects.toThrow("the queue broke");

    expect(
      await db.select().from(creditNotes).where(eq(creditNotes.id, record.creditNoteId)),
    ).toEqual([]);
  });
});
