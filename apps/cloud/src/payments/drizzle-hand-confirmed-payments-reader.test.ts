import { randomUUID } from "node:crypto";
import type { HandConfirmedPaymentsQuery } from "@purosur/domain/payments/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registers, users } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import {
  applyCancelledSale,
  applyCompletedSale,
  applyVoidedSale,
} from "../sales/test-support/applied-sales.js";
import { insertLocation } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleHandConfirmedPaymentsReader } from "./drizzle-hand-confirmed-payments-reader.js";

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

const reader = () => new DrizzleHandConfirmedPaymentsReader(db);

const PROVIDERS = {
  CASH: "NONE",
  TRANSFER: "NONE",
  QR: "MERCADOPAGO_QR",
  POINT: "MERCADOPAGO_POINT",
  STANDALONE_TERMINAL: "EXTERNAL_TERMINAL",
} as const;

async function aUser(firstName: string, locationId: string): Promise<string> {
  const id = randomUUID();
  await db.insert(users).values({ id, firstName, email: `${id}@example.com`, locationId });
  return id;
}

function aPayment(
  method: keyof typeof PROVIDERS,
  amount: number,
  options: { confirmedAt?: Date; authorizedBy?: string | null } = {},
) {
  const byHand = method === "TRANSFER" || method === "STANDALONE_TERMINAL";
  return {
    id: randomUUID(),
    method,
    provider: PROVIDERS[method],
    amount,
    tendered: method === "CASH" ? amount : null,
    state: "APPROVED",
    occurredAt: MOMENT,
    authorizedBy: byHand ? (options.authorizedBy ?? randomUUID()) : null,
    confirmedAt: byHand ? (options.confirmedAt ?? MOMENT) : null,
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
  overrides: { actorId?: string; operationNumber?: number } = {},
) {
  const total = payments.reduce((sum, payment) => sum + payment.amount, 0);
  return applyCompletedSale(db, {
    deviceId,
    completedAt: MOMENT,
    total,
    overrides: { payments, ...overrides },
  });
}

const query = (
  locationId: string,
  overrides: Partial<HandConfirmedPaymentsQuery> = {},
): HandConfirmedPaymentsQuery => ({
  locationId,
  period: wholeOctober,
  registerId: undefined,
  method: undefined,
  ...overrides,
});

describe("DrizzleHandConfirmedPaymentsReader.handConfirmedPayments", () => {
  it("reads a payment with its method, amount, confirmation instant, people and sale number", async () => {
    const { deviceId, locationId } = await aRegister("Caja 1");
    const cashierId = await aUser("Ana", locationId);
    const confirmerId = await aUser("Beto", locationId);
    const payment = aPayment("TRANSFER", 1_200, { authorizedBy: confirmerId });
    await sold(deviceId, [payment], { actorId: cashierId, operationNumber: 42 });

    const payments = await reader().handConfirmedPayments(query(locationId));

    expect(payments).toEqual([
      {
        id: payment.id,
        method: "TRANSFER",
        amount: 1_200,
        confirmedAt: MOMENT,
        cashierId,
        cashierName: "Ana",
        confirmedById: confirmerId,
        confirmedByName: "Beto",
        saleOperationNumber: 42,
      },
    ]);
  });

  it("leaves a name empty when the person is no longer a known user and a sale number empty when it has none", async () => {
    const { deviceId, locationId } = await aRegister("Caja 1");
    const strangerId = randomUUID();
    await sold(deviceId, [aPayment("STANDALONE_TERMINAL", 800, { authorizedBy: strangerId })], {
      actorId: strangerId,
    });

    const [payment] = await reader().handConfirmedPayments(query(locationId));

    expect(payment).toMatchObject({
      method: "STANDALONE_TERMINAL",
      cashierId: strangerId,
      cashierName: null,
      confirmedById: strangerId,
      confirmedByName: null,
      saleOperationNumber: null,
    });
  });

  it("leaves out the payments that nobody confirms by hand", async () => {
    const { deviceId, locationId } = await aRegister("Caja 1");
    await sold(deviceId, [aPayment("CASH", 1), aPayment("QR", 20), aPayment("POINT", 300)]);
    await sold(deviceId, [aPayment("TRANSFER", 4_000)]);

    const payments = await reader().handConfirmedPayments(query(locationId));

    expect(payments.map(({ method, amount }) => ({ method, amount }))).toEqual([
      { method: "TRANSFER", amount: 4_000 },
    ]);
  });

  it("leaves out a payment that was not approved", async () => {
    const { deviceId, locationId } = await aRegister("Caja 1");
    await sold(deviceId, [{ ...aPayment("TRANSFER", 4_000), state: "DECLINED" }]);

    expect(await reader().handConfirmedPayments(query(locationId))).toEqual([]);
  });

  it("dates a payment by the Argentina calendar day it was confirmed", async () => {
    const { deviceId, locationId } = await aRegister("Caja 1");
    const at = (confirmedAt: string) => ({ confirmedAt: new Date(confirmedAt) });
    await sold(deviceId, [aPayment("TRANSFER", 1, at("2026-10-05T02:59:00.000Z"))]);
    await sold(deviceId, [aPayment("TRANSFER", 20, at("2026-10-05T03:00:00.000Z"))]);
    await sold(deviceId, [aPayment("TRANSFER", 300, at("2026-10-07T02:59:00.000Z"))]);
    await sold(deviceId, [aPayment("TRANSFER", 4_000, at("2026-10-07T03:00:00.000Z"))]);

    const payments = await reader().handConfirmedPayments(
      query(locationId, { period: { from: "2026-10-05", to: "2026-10-06" } }),
    );

    expect(payments.map(({ amount }) => amount).sort((a, b) => a - b)).toEqual([20, 300]);
  });

  it("limits the read to the asked register", async () => {
    const first = await aRegister("Caja 1");
    const second = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    await sold(first.deviceId, [aPayment("TRANSFER", 1_000)]);
    await sold(second.deviceId, [aPayment("TRANSFER", 250)]);

    const payments = await reader().handConfirmedPayments(
      query(first.locationId, { registerId: second.registerId }),
    );

    expect(payments.map(({ amount }) => amount)).toEqual([250]);
  });

  it("limits the read to the asked method", async () => {
    const { deviceId, locationId } = await aRegister("Caja 1");
    await sold(deviceId, [aPayment("TRANSFER", 1_000)]);
    await sold(deviceId, [aPayment("STANDALONE_TERMINAL", 250)]);

    const payments = await reader().handConfirmedPayments(
      query(locationId, { method: "STANDALONE_TERMINAL" }),
    );

    expect(payments.map(({ amount }) => amount)).toEqual([250]);
  });

  it("never shows the payments of another branch, not even by asking for its register", async () => {
    const own = await aRegister("Caja 1");
    const other = await aRegister("Caja 1", await insertLocation(db));
    await sold(own.deviceId, [aPayment("TRANSFER", 1_000)]);
    await sold(other.deviceId, [aPayment("TRANSFER", 7_000)]);

    const ofTheBranch = await reader().handConfirmedPayments(query(own.locationId));
    const ofAnotherBranchsRegister = await reader().handConfirmedPayments(
      query(own.locationId, { registerId: other.registerId }),
    );

    expect(ofTheBranch.map(({ amount }) => amount)).toEqual([1_000]);
    expect(ofAnotherBranchsRegister).toEqual([]);
  });

  it("keeps the payment of a cancelled sale", async () => {
    const { deviceId, locationId } = await aRegister("Caja 1");
    const payment = aPayment("TRANSFER", 1_000);
    await applyCancelledSale(db, {
      deviceId,
      cancelledAt: MOMENT,
      total: 1_000,
      overrides: {
        payments: [payment],
        refunds: [
          {
            id: randomUUID(),
            paymentId: payment.id,
            method: "TRANSFER",
            provider: "NONE",
            amount: 1_000,
            state: "PENDING",
            occurredAt: MOMENT,
          },
        ],
      },
    });

    const payments = await reader().handConfirmedPayments(query(locationId));

    expect(payments.map(({ id }) => id)).toEqual([payment.id]);
  });

  it("keeps the payment of a voided sale", async () => {
    const { deviceId, locationId } = await aRegister("Caja 1");
    const payment = aPayment("STANDALONE_TERMINAL", 2_000);
    await applyVoidedSale(db, {
      deviceId,
      completedAt: MOMENT,
      voidedAt: new Date("2026-10-06T15:00:00.000Z"),
      completed: { payments: [payment], total: 2_000 },
    });

    const payments = await reader().handConfirmedPayments(query(locationId));

    expect(payments.map(({ id }) => id)).toEqual([payment.id]);
  });

  it("refuses to report a payment confirmed by hand that does not say who confirmed it", async () => {
    const { deviceId, locationId } = await aRegister("Caja 1");
    await sold(deviceId, [{ ...aPayment("TRANSFER", 1_000), authorizedBy: null }]);

    await expect(reader().handConfirmedPayments(query(locationId))).rejects.toThrow(
      /does not say who confirmed it/,
    );
  });
});
