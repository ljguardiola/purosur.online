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

type RecordedOutcome =
  | "authorized"
  | "rejected"
  | "unclear"
  | "not_attempted"
  | "adopted"
  | "released"
  | "conflicting"
  | null;

function outcomeColumns(outcome: RecordedOutcome) {
  switch (outcome) {
    case "authorized":
      return {
        answerKind: outcome,
        answeredAt: NOW,
        authorizationCode: "75123456789012",
        authorizationCodeDueOn: "2026-10-20",
      };
    case "rejected":
      return {
        answerKind: outcome,
        answeredAt: NOW,
        rejectionCodes: [10016],
        rejectionClass: "content",
      };
    case "unclear":
      return { answerKind: outcome, answeredAt: NOW, unclearCodes: [] };
    case "not_attempted":
      return { answerKind: outcome, answeredAt: NOW };
    case "adopted":
      return {
        answerKind: "unclear",
        answeredAt: NOW,
        unclearCodes: [],
        decision: outcome,
        decidedAt: NOW,
        adoptedAuthorizationCode: "75123456789012",
        adoptedAuthorizationCodeDueOn: "2026-10-20",
      };
    case "released":
      return {
        answerKind: "unclear",
        answeredAt: NOW,
        unclearCodes: [],
        decision: outcome,
        decidedAt: NOW,
      };
    case "conflicting":
      return {
        answerKind: "unclear",
        answeredAt: NOW,
        unclearCodes: [],
        decision: outcome,
        decidedAt: NOW,
      };
    case null:
      return {};
  }
}

async function insertFiscalRequestRow(
  registerId: string,
  pointOfSale: number,
  issuedOn: string,
  outcome: RecordedOutcome,
  saleId: string = crypto.randomUUID(),
): Promise<void> {
  requestNumber += 1;
  await db.insert(fiscalRequests).values({
    fiscalDocumentId: crypto.randomUUID(),
    registerId,
    saleId,
    pointOfSale,
    number: requestNumber,
    issuedOn,
    total: 1500,
    buyerTaxStatusCode: 5,
    receivedAt: NOW,
    notAfter: NOW,
    ...outcomeColumns(outcome),
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

async function pendingSaleOf(registerId: string): Promise<typeof deferredSales.$inferSelect> {
  return insertDeferredSaleRow(db, { registerId, locationId: installation.locationId });
}

async function mayAlreadyBeInvoicedOf(deferredSaleId: string): Promise<boolean | undefined> {
  const locked = await store().transaction((transaction) => transaction.lockPendingDeferredSales());
  return locked.find((sale) => sale.id === deferredSaleId)?.mayAlreadyBeInvoiced;
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
        mayAlreadyBeInvoiced: false,
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
        mayAlreadyBeInvoiced: false,
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
        mayAlreadyBeInvoiced: false,
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

  it("reads the last authorized day also from the fiscal requests whose unclear answer was adopted from the tax authority", async () => {
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 7,
      name: "caja-7",
    });
    await insertFiscalRequestRow(registerId, 7, "2026-10-03", "authorized");
    await insertFiscalRequestRow(registerId, 7, "2026-10-06", "adopted");
    await insertFiscalRequestRow(registerId, 7, "2026-10-08", "released");
    await insertFiscalRequestRow(registerId, 7, "2026-10-09", "unclear");
    await pendingSaleOf(registerId);

    expect(await lastAuthorizedDayOf(registerId)).toBe("2026-10-06");
  });

  it("marks a pending deferred sale as possibly invoiced while its own sale has a fiscal request the tax authority holds or may hold", async () => {
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 7,
      name: "caja-7",
    });
    const outcomes: RecordedOutcome[] = [
      "authorized",
      "adopted",
      null,
      "unclear",
      "not_attempted",
      "rejected",
      "released",
      "conflicting",
    ];
    const sales = [];
    for (const outcome of outcomes) {
      const sale = await pendingSaleOf(registerId);
      await insertFiscalRequestRow(registerId, 7, "2026-10-03", outcome, sale.saleId);
      sales.push(sale);
    }
    const withoutRequest = await pendingSaleOf(registerId);
    await insertFiscalRequestRow(registerId, 7, "2026-10-03", "authorized");

    const flags = await Promise.all(sales.map((sale) => mayAlreadyBeInvoicedOf(sale.id)));
    expect(
      Object.fromEntries(outcomes.map((outcome, index) => [String(outcome), flags[index]])),
    ).toEqual({
      authorized: true,
      adopted: true,
      null: true,
      unclear: true,
      not_attempted: true,
      rejected: false,
      released: false,
      conflicting: false,
    });
    expect(await mayAlreadyBeInvoicedOf(withoutRequest.id)).toBe(false);
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
