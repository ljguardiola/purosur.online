import { CREDIT_NOTE_C_DOCUMENT_TYPE, deferredSaleRegularizationTask } from "@purosur/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  deferredSales,
  fiscalRequests,
  fiscalTasks,
  taxAuthorityLastAuthorizedNumbers,
} from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleDeferredSaleExpiryStore } from "./drizzle-deferred-sale-expiry-store.js";
import { insertRegisterWithPointOfSale } from "./test-support/authorization-request-fixtures.js";
import { insertDeferredSaleRow } from "./test-support/deferred-sale-fixtures.js";

const NOW = new Date("2026-10-10T03:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let installation: Awaited<ReturnType<typeof insertEnrolledInstallation>>;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  installation = await insertEnrolledInstallation(db, { now: NOW });
});

function store() {
  return new DrizzleDeferredSaleExpiryStore(db);
}

let requestNumber = 0;

async function insertFiscalRequestRow(
  registerId: string,
  pointOfSale: number,
  issuedOn: string,
  answer: "authorized" | "rejected" | null,
): Promise<void> {
  requestNumber += 1;
  const answered =
    answer === "authorized"
      ? { authorizationCode: "75123456789012", authorizationCodeDueOn: "2026-10-20" }
      : answer === "rejected"
        ? { rejectionCodes: [10016], rejectionClass: "content" }
        : {};
  await db.insert(fiscalRequests).values({
    fiscalDocumentId: crypto.randomUUID(),
    registerId,
    saleId: crypto.randomUUID(),
    pointOfSale,
    number: requestNumber,
    issuedOn,
    total: 1500,
    buyerTaxStatusCode: 5,
    receivedAt: NOW,
    notAfter: NOW,
    answerKind: answer,
    answeredAt: answer === null ? null : NOW,
    ...answered,
  });
}

async function insertLastAuthorized(
  pointOfSaleNumber: number,
  documentType: "factura_c" | typeof CREDIT_NOTE_C_DOCUMENT_TYPE,
  issuedOn: string | null,
): Promise<void> {
  await db
    .insert(taxAuthorityLastAuthorizedNumbers)
    .values({ pointOfSaleNumber, documentType, lastAuthorized: 10, issuedOn, readAt: NOW });
}

async function lastAuthorizedDayOf(registerId: string): Promise<string | null | undefined> {
  const locked = await store().transaction((transaction) => transaction.lockPendingDeferredSales());
  return locked.find((sale) => sale.registerId === registerId)?.lastAuthorizedIssuedOn;
}

async function pendingSaleOf(registerId: string): Promise<void> {
  await insertDeferredSaleRow(db, { registerId, locationId: installation.locationId });
}

describe("DrizzleDeferredSaleExpiryStore", () => {
  it("locks the pending deferred sales, oldest first, whatever their age", async () => {
    const newer = await insertDeferredSaleRow(db, {
      ...installation,
      occurredAt: new Date("2026-09-02T12:00:00.000Z"),
    });
    const older = await insertDeferredSaleRow(db, {
      ...installation,
      occurredAt: new Date("2026-09-01T12:00:00.000Z"),
      total: 9900,
      shortCode: "AAAA2222",
    });
    const newest = await insertDeferredSaleRow(db, {
      ...installation,
      occurredAt: new Date("2026-09-03T12:00:00.000Z"),
      total: 700,
      shortCode: "BBBB3333",
    });
    await insertDeferredSaleRow(db, {
      ...installation,
      occurredAt: new Date("2026-09-01T12:00:00.000Z"),
      state: "satisfied",
      satisfiedAt: NOW,
    });

    const locked = await store().transaction((transaction) =>
      transaction.lockPendingDeferredSales(),
    );

    expect(locked).toEqual([
      {
        id: older.id,
        saleId: older.saleId,
        registerId: installation.registerId,
        locationId: installation.locationId,
        occurredAt: older.occurredAt,
        total: 9900,
        shortCode: "AAAA2222",
        lastAuthorizedIssuedOn: null,
      },
      {
        id: newer.id,
        saleId: newer.saleId,
        registerId: installation.registerId,
        locationId: installation.locationId,
        occurredAt: newer.occurredAt,
        total: 4800,
        shortCode: "7KQ4M2P9",
        lastAuthorizedIssuedOn: null,
      },
      {
        id: newest.id,
        saleId: newest.saleId,
        registerId: installation.registerId,
        locationId: installation.locationId,
        occurredAt: newest.occurredAt,
        total: 700,
        shortCode: "BBBB3333",
        lastAuthorizedIssuedOn: null,
      },
    ]);
  });

  it("reads the last authorized day from the tax authority's last authorized Factura C of the register's point of sale", async () => {
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 7,
      name: "caja-7",
    });
    const otherRegisterId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 8,
      name: "caja-8",
    });
    await insertLastAuthorized(7, "factura_c", "2026-10-05");
    await insertLastAuthorized(7, CREDIT_NOTE_C_DOCUMENT_TYPE, "2026-10-09");
    await insertLastAuthorized(8, "factura_c", "2026-10-08");
    await pendingSaleOf(registerId);
    await pendingSaleOf(otherRegisterId);

    expect(await lastAuthorizedDayOf(registerId)).toBe("2026-10-05");
    expect(await lastAuthorizedDayOf(otherRegisterId)).toBe("2026-10-08");
  });

  it("reads the last authorized day from the authorized fiscal requests of the register's point of sale", async () => {
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 7,
      name: "caja-7",
    });
    await insertFiscalRequestRow(registerId, 7, "2026-10-03", "authorized");
    await insertFiscalRequestRow(registerId, 7, "2026-10-06", "authorized");
    await insertFiscalRequestRow(registerId, 7, "2026-10-09", "rejected");
    await insertFiscalRequestRow(registerId, 7, "2026-10-09", null);
    await insertFiscalRequestRow(registerId, 8, "2026-10-09", "authorized");
    await pendingSaleOf(registerId);

    expect(await lastAuthorizedDayOf(registerId)).toBe("2026-10-06");
  });

  it("takes the later of the tax authority's day and the authorized fiscal requests' day", async () => {
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 7,
      name: "caja-7",
    });
    const otherRegisterId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 8,
      name: "caja-8",
    });
    await insertLastAuthorized(7, "factura_c", "2026-10-05");
    await insertFiscalRequestRow(registerId, 7, "2026-10-07", "authorized");
    await insertLastAuthorized(8, "factura_c", "2026-10-09");
    await insertFiscalRequestRow(otherRegisterId, 8, "2026-10-04", "authorized");
    await pendingSaleOf(registerId);
    await pendingSaleOf(otherRegisterId);

    expect(await lastAuthorizedDayOf(registerId)).toBe("2026-10-07");
    expect(await lastAuthorizedDayOf(otherRegisterId)).toBe("2026-10-09");
  });

  it("has no last authorized day for a point of sale without an authorized document", async () => {
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 7,
      name: "caja-7",
    });
    await insertLastAuthorized(7, "factura_c", null);
    await pendingSaleOf(registerId);

    expect(await lastAuthorizedDayOf(registerId)).toBeNull();
  });

  it("has no last authorized day for a register without a point of sale", async () => {
    await insertLastAuthorized(7, "factura_c", "2026-10-05");
    await pendingSaleOf(installation.registerId);

    expect(await lastAuthorizedDayOf(installation.registerId)).toBeNull();
  });

  it("expires a deferred sale and opens the regularization task naming its date, total and short code", async () => {
    const sale = await insertDeferredSaleRow(db, installation);
    const task = deferredSaleRegularizationTask(
      {
        id: sale.id,
        saleId: sale.saleId,
        registerId: sale.registerId,
        locationId: sale.locationId,
        occurredAt: sale.occurredAt,
        total: sale.total,
        shortCode: sale.shortCode,
        lastAuthorizedIssuedOn: null,
      },
      NOW,
    );

    await store().transaction((transaction) => transaction.recordExpiry(sale.id, task));

    const [expired] = await db.select().from(deferredSales).where(eq(deferredSales.id, sale.id));
    expect(expired).toMatchObject({ state: "expired", expiredAt: NOW });
    const [row] = await db.select().from(fiscalTasks);
    expect(row).toMatchObject({
      kind: "deferred_sale_expired",
      registerId: sale.registerId,
      deferredSaleId: sale.id,
      pointOfSale: null,
      documentType: null,
      number: null,
      state: "open",
      createdAt: NOW,
      closedAt: null,
      reason: {
        saleOccurredAt: sale.occurredAt.toISOString(),
        total: 4800,
        shortCode: "7KQ4M2P9",
      },
    });
  });

  it("leaves the deferred sale pending when its expiry cannot be recorded", async () => {
    const sale = await insertDeferredSaleRow(db, installation);
    const task = deferredSaleRegularizationTask(
      {
        id: sale.id,
        saleId: sale.saleId,
        registerId: sale.registerId,
        locationId: sale.locationId,
        occurredAt: sale.occurredAt,
        total: sale.total,
        shortCode: sale.shortCode,
        lastAuthorizedIssuedOn: null,
      },
      NOW,
    );

    await expect(
      store().transaction(async (transaction) => {
        await transaction.recordExpiry(sale.id, task);
        throw new Error("interrupted");
      }),
    ).rejects.toThrow("interrupted");

    const [row] = await db.select().from(deferredSales);
    expect(row).toMatchObject({ state: "pending", expiredAt: null });
    expect(await db.select().from(fiscalTasks)).toEqual([]);
  });
});
