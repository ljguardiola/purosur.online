import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registers } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { applyCancelledSale, applyCompletedSale } from "../sales/test-support/applied-sales.js";
import { insertLocation } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzlePaymentsReportReader } from "./drizzle-payments-report-reader.js";

const NOW = new Date("2026-10-07T15:00:00.000Z");
const MOMENT = new Date("2026-10-06T14:00:00.000Z");
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

const reader = () => new DrizzlePaymentsReportReader(db);

const PROVIDERS = {
  CASH: "NONE",
  TRANSFER: "NONE",
  QR: "MERCADOPAGO_QR",
  POINT: "MERCADOPAGO_POINT",
  STANDALONE_TERMINAL: "EXTERNAL_TERMINAL",
} as const;

function aPayment(method: keyof typeof PROVIDERS, amount: number, state = "APPROVED") {
  return {
    id: randomUUID(),
    method,
    provider: PROVIDERS[method],
    amount,
    tendered: method === "CASH" ? amount : null,
    state,
    occurredAt: MOMENT,
    authorizedBy: null,
    confirmedAt: null,
  };
}

async function aRegister(name: string, locationId?: string) {
  if (locationId === undefined) {
    return insertEnrolledInstallation(db, { now: NOW, registerName: name });
  }
  const [register] = await db
    .insert(registers)
    .values({ locationId, name })
    .returning({ id: registers.id });
  if (!register) {
    throw new Error("test setup: seeding the register returned no row");
  }
  return insertEnrolledInstallation(db, { now: NOW, existingRegisterId: register.id });
}

async function sold(
  deviceId: string,
  payments: ReturnType<typeof aPayment>[],
  completedAt = MOMENT,
) {
  const total = payments.reduce((sum, payment) => sum + payment.amount, 0);
  return applyCompletedSale(db, { deviceId, completedAt, total, overrides: { payments } });
}

describe("DrizzlePaymentsReportReader.approvedPaymentsByMethod", () => {
  it("adds up the approved payments of each method and counts the sales paid with it", async () => {
    const { deviceId, locationId } = await aRegister("Caja 1");
    await sold(deviceId, [aPayment("CASH", 4_000)]);
    await sold(deviceId, [aPayment("CASH", 1_000)]);
    await sold(deviceId, [aPayment("QR", 6_000)]);
    await sold(deviceId, [aPayment("POINT", 2_500)]);
    await sold(deviceId, [aPayment("TRANSFER", 700)]);
    await sold(deviceId, [aPayment("STANDALONE_TERMINAL", 3_200)]);

    const report = await reader().approvedPaymentsByMethod({
      locationId,
      period: wholeOctober,
      registerId: undefined,
    });

    expect([...report.methods].sort((a, b) => a.method.localeCompare(b.method))).toEqual([
      { method: "CASH", salesCount: 2, amount: 5_000 },
      { method: "POINT", salesCount: 1, amount: 2_500 },
      { method: "QR", salesCount: 1, amount: 6_000 },
      { method: "STANDALONE_TERMINAL", salesCount: 1, amount: 3_200 },
      { method: "TRANSFER", salesCount: 1, amount: 700 },
    ]);
    expect(report.salesCount).toBe(6);
    expect(report.total).toBe(17_400);
  });

  it("counts a sale once in the total when it was paid with two payments", async () => {
    const { deviceId, locationId } = await aRegister("Caja 1");
    await sold(deviceId, [aPayment("CASH", 1_000), aPayment("QR", 3_000)]);

    const report = await reader().approvedPaymentsByMethod({
      locationId,
      period: wholeOctober,
      registerId: undefined,
    });

    expect(report.salesCount).toBe(1);
    expect(report.total).toBe(4_000);
    expect(report.methods).toHaveLength(2);
  });

  it("counts a sale once in a method it was paid with in two payments", async () => {
    const { deviceId, locationId } = await aRegister("Caja 1");
    await sold(deviceId, [aPayment("CASH", 1_000), aPayment("CASH", 500)]);

    const report = await reader().approvedPaymentsByMethod({
      locationId,
      period: wholeOctober,
      registerId: undefined,
    });

    expect(report.methods).toEqual([{ method: "CASH", salesCount: 1, amount: 1_500 }]);
  });

  it("leaves out a payment that was not approved, and a sale left with none", async () => {
    const { deviceId, locationId } = await aRegister("Caja 1");
    await sold(deviceId, [aPayment("QR", 6_000, "EXPIRED")]);
    await sold(deviceId, [aPayment("CASH", 1_000), aPayment("QR", 2_000, "DECLINED")]);

    const report = await reader().approvedPaymentsByMethod({
      locationId,
      period: wholeOctober,
      registerId: undefined,
    });

    expect(report.methods).toEqual([{ method: "CASH", salesCount: 1, amount: 1_000 }]);
    expect(report.salesCount).toBe(1);
    expect(report.total).toBe(1_000);
  });

  it("leaves out the payments of a cancelled sale", async () => {
    const { deviceId, locationId } = await aRegister("Caja 1");
    await sold(deviceId, [aPayment("CASH", 1_000)]);
    await applyCancelledSale(db, { deviceId, cancelledAt: MOMENT, total: 4_800 });

    const report = await reader().approvedPaymentsByMethod({
      locationId,
      period: wholeOctober,
      registerId: undefined,
    });

    expect(report.methods).toEqual([{ method: "CASH", salesCount: 1, amount: 1_000 }]);
    expect(report.total).toBe(1_000);
  });

  it("dates a payment by the Argentina calendar day its sale was completed", async () => {
    const { deviceId, locationId } = await aRegister("Caja 1");
    const at = (completedAt: string) => new Date(completedAt);
    await sold(deviceId, [aPayment("CASH", 1)], at("2026-10-05T02:59:00.000Z"));
    await sold(deviceId, [aPayment("CASH", 20)], at("2026-10-05T03:00:00.000Z"));
    await sold(deviceId, [aPayment("CASH", 300)], at("2026-10-07T02:59:00.000Z"));
    await sold(deviceId, [aPayment("CASH", 4_000)], at("2026-10-07T03:00:00.000Z"));

    const report = await reader().approvedPaymentsByMethod({
      locationId,
      period: { from: "2026-10-05", to: "2026-10-06" },
      registerId: undefined,
    });

    expect(report.methods).toEqual([{ method: "CASH", salesCount: 2, amount: 320 }]);
  });

  it("limits the report to the sales of the asked register", async () => {
    const first = await aRegister("Caja 1");
    const second = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    await sold(first.deviceId, [aPayment("CASH", 1_000)]);
    await sold(second.deviceId, [aPayment("QR", 250)]);

    const report = await reader().approvedPaymentsByMethod({
      locationId: first.locationId,
      period: wholeOctober,
      registerId: second.registerId,
    });

    expect(report.methods).toEqual([{ method: "QR", salesCount: 1, amount: 250 }]);
  });

  it("never shows the payments of another branch, not even by asking for its register", async () => {
    const own = await aRegister("Caja 1");
    const other = await aRegister("Caja 1", await insertLocation(db));
    await sold(own.deviceId, [aPayment("CASH", 1_000)]);
    await sold(other.deviceId, [aPayment("CASH", 7_000)]);

    const ofTheBranch = await reader().approvedPaymentsByMethod({
      locationId: own.locationId,
      period: wholeOctober,
      registerId: undefined,
    });
    const ofAnotherBranchsRegister = await reader().approvedPaymentsByMethod({
      locationId: own.locationId,
      period: wholeOctober,
      registerId: other.registerId,
    });

    expect(ofTheBranch.total).toBe(1_000);
    expect(ofAnotherBranchsRegister).toEqual({ methods: [], salesCount: 0, total: 0 });
  });

  it("reports nothing for a range without sales", async () => {
    const { locationId } = await aRegister("Caja 1");

    const report = await reader().approvedPaymentsByMethod({
      locationId,
      period: wholeOctober,
      registerId: undefined,
    });

    expect(report).toEqual({ methods: [], salesCount: 0, total: 0 });
  });
});
