import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { paymentTransactions, registers } from "../platform/db/schema.js";
import { insertLocation } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleMercadoPagoChargeCostsReader } from "./drizzle-mercado-pago-charge-costs-reader.js";
import { insertRegister, pendingTransaction } from "./test-support/payment-transaction-fixtures.js";
import {
  insertSettlementMovements,
  MOVEMENT_DATE,
  settlementRow,
} from "./test-support/settlement-movement-fixtures.js";

const wholeOctober = { from: "2026-10-01", to: "2026-10-31" };

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

const reader = () => new DrizzleMercadoPagoChargeCostsReader(db);

async function approvedCharge(registerId: string, overrides = {}) {
  const transaction = pendingTransaction(registerId, { state: "APPROVED", ...overrides });
  await db.insert(paymentTransactions).values(transaction);
  return transaction;
}

describe("DrizzleMercadoPagoChargeCostsReader.chargesOfPeriod", () => {
  it("lists an approved charge with every movement of the source that names it", async () => {
    const registerId = await insertRegister(db, "Caja 1");
    const locationId = await seededLocationId(db);
    const charge = await approvedCharge(registerId);
    await insertSettlementMovements(db, [
      settlementRow({ sourceId: "PAY1", externalReference: charge.id }),
      settlementRow({ sourceId: "PAY1", transactionType: "REFUND", grossAmount: -2_000 }),
      settlementRow({ sourceId: "PAY2", externalReference: crypto.randomUUID() }),
    ]);

    const charges = await reader().chargesOfPeriod({ locationId, period: wholeOctober });

    expect(charges).toEqual([
      {
        paymentTransactionId: charge.id,
        saleId: charge.saleId,
        method: "QR",
        registerId,
        registerName: "Caja 1",
        amount: charge.amount,
        chargedAt: charge.createdAt,
        movements: expect.arrayContaining([
          expect.objectContaining({ sourceId: "PAY1", transactionType: "SETTLEMENT" }),
          expect.objectContaining({ sourceId: "PAY1", transactionType: "REFUND" }),
        ]),
      },
    ]);
    expect(charges[0]?.movements).toHaveLength(2);
  });

  it("matches the external reference whatever its case", async () => {
    const registerId = await insertRegister(db, "Caja 1");
    const locationId = await seededLocationId(db);
    const charge = await approvedCharge(registerId);
    await insertSettlementMovements(db, [
      settlementRow({ externalReference: charge.id.toUpperCase() }),
    ]);

    const [listed] = await reader().chargesOfPeriod({ locationId, period: wholeOctober });

    expect(listed?.movements).toHaveLength(1);
  });

  it("lists a charge no report has reached with no movements", async () => {
    const registerId = await insertRegister(db, "Caja 1");
    const locationId = await seededLocationId(db);
    const charge = await approvedCharge(registerId);

    const charges = await reader().chargesOfPeriod({ locationId, period: wholeOctober });

    expect(charges).toEqual([
      expect.objectContaining({ paymentTransactionId: charge.id, movements: [] }),
    ]);
  });

  it("tells a Point charge from a QR charge", async () => {
    const registerId = await insertRegister(db, "Caja 1");
    const locationId = await seededLocationId(db);
    await approvedCharge(registerId, {
      method: "POINT",
      provider: "MERCADOPAGO_POINT",
      cardType: "DEBIT",
    });

    const [listed] = await reader().chargesOfPeriod({ locationId, period: wholeOctober });

    expect(listed?.method).toBe("POINT");
  });

  it("leaves out the transactions that were not approved", async () => {
    const registerId = await insertRegister(db, "Caja 1");
    const locationId = await seededLocationId(db);
    await approvedCharge(registerId, { state: "PENDING" });
    await approvedCharge(registerId, { state: "DECLINED" });
    await approvedCharge(registerId, { state: "EXPIRED" });

    expect(await reader().chargesOfPeriod({ locationId, period: wholeOctober })).toEqual([]);
  });

  it("leaves out the charges of another location", async () => {
    const registerId = await insertRegister(db, "Caja 1");
    const locationId = await seededLocationId(db);
    const [other] = await db
      .insert(registers)
      .values({ locationId: await insertLocation(db), name: "Caja 9" })
      .returning({ id: registers.id });
    await approvedCharge(other?.id ?? "");
    const own = await approvedCharge(registerId);

    const charges = await reader().chargesOfPeriod({ locationId, period: wholeOctober });

    expect(charges.map((charge) => charge.paymentTransactionId)).toEqual([own.id]);
  });

  it("lists only the charges of the period, by Argentine day", async () => {
    const registerId = await insertRegister(db, "Caja 1");
    const locationId = await seededLocationId(db);
    const inside = await approvedCharge(registerId, {
      createdAt: new Date("2026-10-01T03:00:00.000Z"),
    });
    await approvedCharge(registerId, { createdAt: new Date("2026-10-01T02:59:00.000Z") });
    await approvedCharge(registerId, { createdAt: new Date("2026-11-01T03:00:00.000Z") });

    const charges = await reader().chargesOfPeriod({ locationId, period: wholeOctober });

    expect(charges.map((charge) => charge.paymentTransactionId)).toEqual([inside.id]);
  });
});

describe("DrizzleMercadoPagoChargeCostsReader.otherChargesOfPeriod", () => {
  it("lists the sources no payment transaction of ours explains, with all their movements", async () => {
    const registerId = await insertRegister(db, "Caja 1");
    const ours = await approvedCharge(registerId);
    await insertSettlementMovements(db, [
      settlementRow({ sourceId: "OURS", externalReference: ours.id }),
      settlementRow({ sourceId: "EMPTY", externalReference: "" }),
      settlementRow({ sourceId: "EMPTY", transactionType: "REFUND" }),
      settlementRow({ sourceId: "UNKNOWN", externalReference: crypto.randomUUID() }),
      settlementRow({ sourceId: "NONE", externalReference: null }),
    ]);

    const others = await reader().otherChargesOfPeriod({ period: wholeOctober });

    expect(others.map((other) => other.sourceId).sort()).toEqual(["EMPTY", "NONE", "UNKNOWN"]);
    expect(others.find((other) => other.sourceId === "EMPTY")?.movements).toHaveLength(2);
  });

  it("leaves out a source explained by a payment transaction in any location", async () => {
    const [other] = await db
      .insert(registers)
      .values({ locationId: await insertLocation(db), name: "Caja 9" })
      .returning({ id: registers.id });
    const charge = await approvedCharge(other?.id ?? "");
    await insertSettlementMovements(db, [
      settlementRow({ sourceId: "ELSEWHERE", externalReference: charge.id }),
    ]);

    expect(await reader().otherChargesOfPeriod({ period: wholeOctober })).toEqual([]);
  });

  it("leaves out a source with no movement on a day of the period", async () => {
    await insertSettlementMovements(db, [
      settlementRow({ sourceId: "SEPTEMBER", transactionDate: new Date("2026-09-30T14:00:00Z") }),
      settlementRow({ sourceId: "INSIDE", transactionDate: MOVEMENT_DATE }),
    ]);

    const others = await reader().otherChargesOfPeriod({ period: wholeOctober });

    expect(others.map((other) => other.sourceId)).toEqual(["INSIDE"]);
  });

  it("keeps the movements of a source outside the period when another one is inside", async () => {
    await insertSettlementMovements(db, [
      settlementRow({ sourceId: "SPLIT", transactionDate: new Date("2026-09-30T14:00:00Z") }),
      settlementRow({
        sourceId: "SPLIT",
        transactionType: "REFUND",
        transactionDate: MOVEMENT_DATE,
      }),
    ]);

    const [other] = await reader().otherChargesOfPeriod({ period: wholeOctober });

    expect(other?.movements).toHaveLength(2);
  });
});
