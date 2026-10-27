import { randomUUID } from "node:crypto";
import { unappliedEventOf } from "@purosur/contracts/sync/test-support/unapplied-event";
import type { SyncedFact, UnappliedEvent } from "@purosur/domain/sync/use-cases";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  branchSettings,
  categories,
  deferredSales,
  fiscalRequests,
  locations,
  offlineFiscalDocuments,
  paymentRefunds,
  products,
  registers,
  sales,
  users,
} from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import {
  APPLICATION_NOW,
  eventApplicationUnderTest,
} from "../sync/test-support/drizzle-event-application.js";
import {
  aCancelledSale,
  aCashSessionOpenedFact,
  aCompletedSale,
  aReturnOf,
  aVoidedSaleOf,
  type CompletedSale,
} from "../sync/test-support/synced-facts.js";
import { DrizzleBranchSaleForReturnReader } from "./drizzle-branch-sale-for-return-reader.js";

const system = eventApplicationUnderTest();

const CASHIER = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";
const COMPLETED_AT = new Date("2026-10-06T11:20:00.000Z");
const RETURNED_AT = new Date("2026-10-08T10:00:00.000Z");

function eventOf(deviceId: string, eventType: string, aggregateId: string): UnappliedEvent {
  return unappliedEventOf(
    {
      event_id: randomUUID(),
      device_seq: 1,
      aggregate_type: eventType.startsWith("cash_session") ? "CashSession" : "Sale",
      aggregate_id: aggregateId,
      event_type: eventType,
      schema_version: 1,
      payload: {},
      occurred_at: COMPLETED_AT.toISOString(),
      actor_id: CASHIER,
      chain_hmac: "hmac",
    },
    { deviceId },
  );
}

async function record(fact: SyncedFact, event: UnappliedEvent) {
  await system.application.transaction((tx) => tx.record(fact, event));
}

async function enrollInOtherBranch() {
  const [otherBranch] = await system.db
    .insert(locations)
    .values({})
    .returning({ id: locations.id });
  const [register] = await system.db
    .insert(registers)
    .values({ locationId: otherBranch?.id as string, name: "Caja 3" })
    .returning({ id: registers.id });
  return insertEnrolledInstallation(system.db, {
    now: APPLICATION_NOW,
    existingRegisterId: register?.id as string,
  });
}

async function setUp(
  overrides: Partial<CompletedSale> = {},
  saleUnit: "UNIT" | "KG" = "UNIT",
  sellingInOtherBranch = false,
) {
  const asking = await system.enrollInstallation({ registerName: "Caja 1" });
  const selling = sellingInOtherBranch
    ? await enrollInOtherBranch()
    : await system.enrollInstallation({ registerName: "Caja 2" });
  await system.db.insert(users).values({
    id: CASHIER,
    firstName: "Ada",
    email: "ada@example.com",
    locationId: selling.locationId,
  });
  const [category] = await system.db
    .insert(categories)
    .values({ name: "Almacen" })
    .returning({ id: categories.id });
  const [product] = await system.db
    .insert(products)
    .values({ name: "Yerba", categoryId: category?.id as string, saleUnit })
    .returning({ id: products.id });
  const sessionId = randomUUID();
  await record(
    aCashSessionOpenedFact({ id: sessionId, openedAt: COMPLETED_AT }),
    eventOf(selling.deviceId, "cash_session_opened", sessionId),
  );
  const base = aCompletedSale({ sessionId, completedAt: COMPLETED_AT });
  const [line] = base.lines;
  const completed: CompletedSale = {
    ...base,
    lines: [{ ...(line as NonNullable<typeof line>), productId: product?.id as string }],
    ...overrides,
  };
  await record(
    { kind: "sale_completed", sale: completed },
    eventOf(selling.deviceId, "sale_completed", completed.id),
  );
  return { asking, selling, completed, sessionId };
}

function reader() {
  return new DrizzleBranchSaleForReturnReader(system.db);
}

async function authorizeInvoice(
  registerId: string,
  saleId: string,
  columns: Partial<typeof fiscalRequests.$inferInsert> = {},
) {
  await system.db.insert(fiscalRequests).values({
    fiscalDocumentId: randomUUID(),
    registerId,
    saleId,
    pointOfSale: 7,
    number: 42,
    issuedOn: "2026-10-06",
    total: 4800,
    buyerTaxStatusCode: 5,
    receivedAt: COMPLETED_AT,
    notAfter: COMPLETED_AT,
    answerKind: "authorized",
    authorizationCode: "75123456789012",
    authorizationCodeDueOn: "2026-10-16",
    answeredAt: COMPLETED_AT,
    ...columns,
  });
}

const INVOICE = { kind: "invoice", pointOfSale: 7, number: 42 } as const;

describe("reading a sale of the branch to return it from another register", () => {
  it("holds the facts of a sale rung up on another register of the asking register's branch", async () => {
    const { asking, selling, completed, sessionId } = await setUp();
    await authorizeInvoice(selling.registerId, completed.id);

    const found = await reader().saleForReturnInBranchOf(asking.registerId, INVOICE);

    expect(found).toEqual({
      sale: {
        sale: {
          id: completed.id,
          registerId: selling.registerId,
          deviceId: selling.deviceId,
          sessionId,
          actorId: CASHIER,
          state: "COMPLETED",
          saleDiscount: null,
          lines: [
            {
              id: completed.lines[0]?.id,
              productId: completed.lines[0]?.productId,
              productName: "Azucar",
              saleUnit: "UNIT",
              quantity: 2,
              promotionId: null,
              lineTotal: 4800,
            },
          ],
        },
        occurredAt: COMPLETED_AT,
        invoice: { pointOfSale: 7, number: 42 },
        payments: [
          {
            id: completed.payments[0]?.id,
            method: "CASH",
            provider: "NONE",
            amount: 5000,
            state: "APPROVED",
            refundedAmount: 0,
          },
        ],
        returned: [],
      },
      goodConditionReturnDays: 15,
      countedReturnIds: [],
    });
  });

  it("holds the sale unit of the product sold", async () => {
    const { asking, selling, completed } = await setUp({}, "KG");
    await authorizeInvoice(selling.registerId, completed.id);

    const found = await reader().saleForReturnInBranchOf(asking.registerId, INVOICE);

    expect(found?.sale.sale.lines[0]?.saleUnit).toBe("KG");
  });

  it("holds the discount on the sale's total", async () => {
    const { asking, selling, completed } = await setUp({
      saleDiscount: {
        kind: "PERCENT",
        percent: 10,
        reason: "cliente frecuente",
        authorizedBy: null,
      },
      saleDiscountAmount: 480,
    });
    await authorizeInvoice(selling.registerId, completed.id);

    const found = await reader().saleForReturnInBranchOf(asking.registerId, INVOICE);

    expect(found?.sale.sale.saleDiscount).toEqual({
      kind: "PERCENT",
      percent: 10,
      reason: "cliente frecuente",
      authorizedBy: null,
    });
  });

  it("holds the days the branch accepts a change of mind", async () => {
    const { asking, selling, completed } = await setUp();
    await authorizeInvoice(selling.registerId, completed.id);
    await system.db
      .update(branchSettings)
      .set({ goodConditionReturnDays: 7 })
      .where(eq(branchSettings.locationId, asking.locationId));

    const found = await reader().saleForReturnInBranchOf(asking.registerId, INVOICE);

    expect(found?.goodConditionReturnDays).toBe(7);
  });

  describe("finding the sale by its ticket", () => {
    it("finds the sale of an invoice the tax authority held after an unclear answer", async () => {
      const { asking, selling, completed } = await setUp();
      await authorizeInvoice(selling.registerId, completed.id, {
        answerKind: "unclear",
        authorizationCode: null,
        authorizationCodeDueOn: null,
        unclearCodes: [],
        decision: "adopted",
        decidedAt: COMPLETED_AT,
        adoptedAuthorizationCode: "75123456789012",
        adoptedAuthorizationCodeDueOn: "2026-10-16",
      });

      expect(await reader().saleForReturnInBranchOf(asking.registerId, INVOICE)).toMatchObject({
        sale: { sale: { id: completed.id } },
      });
    });

    it.each([
      [
        "a rejected invoice",
        {
          answerKind: "rejected",
          authorizationCode: null,
          authorizationCodeDueOn: null,
          rejectionCodes: [10015],
          rejectionClass: "content",
        },
      ],
      [
        "an invoice nobody answered",
        {
          answerKind: null,
          authorizationCode: null,
          authorizationCodeDueOn: null,
          answeredAt: null,
        },
      ],
    ] as const)("does not find the sale of %s", async (_name, columns) => {
      const { asking, selling, completed } = await setUp();
      await authorizeInvoice(selling.registerId, completed.id, columns);

      expect(await reader().saleForReturnInBranchOf(asking.registerId, INVOICE)).toBeUndefined();
    });

    it("finds the sale of an invoice issued offline", async () => {
      const { asking, selling, completed } = await setUp();
      await system.db.insert(offlineFiscalDocuments).values({
        id: randomUUID(),
        saleId: completed.id,
        registerId: selling.registerId,
        pointOfSale: 8,
        documentType: "factura_c",
        number: 12,
        issuedOn: "2026-10-06",
        generatedAt: COMPLETED_AT,
        generationStamp: "20261006082000",
        offlineAuthorizationCode: "21403471111111",
        fortnightStart: "2026-10-01",
        fortnightEnd: "2026-10-15",
        buyerDocumentType: 99,
        buyerDocumentNumber: 0,
        buyerTaxStatusCode: 5,
        total: 4800,
        netAmount: 4800,
        cause: "no_connectivity",
        recordedAt: COMPLETED_AT,
      });

      expect(
        await reader().saleForReturnInBranchOf(asking.registerId, {
          kind: "invoice",
          pointOfSale: 8,
          number: 12,
        }),
      ).toMatchObject({
        sale: { sale: { id: completed.id }, invoice: { pointOfSale: 8, number: 12 } },
      });
    });

    it("finds the sale of a deferred ticket by its id and short code, and holds no invoice for it", async () => {
      const { asking, selling, completed } = await setUp();
      const deferredId = randomUUID();
      await system.db.insert(deferredSales).values({
        id: deferredId,
        saleId: completed.id,
        registerId: selling.registerId,
        locationId: selling.locationId,
        occurredAt: COMPLETED_AT,
        total: 4800,
        reason: "pre_emission_gate_failed",
        shortCode: "7KQ4M2P9",
        routedAt: COMPLETED_AT,
        state: "pending",
      });

      const ticket = { kind: "deferred", id: deferredId, shortCode: "7KQ4M2P9" } as const;
      expect(await reader().saleForReturnInBranchOf(asking.registerId, ticket)).toMatchObject({
        sale: { sale: { id: completed.id }, invoice: null },
      });
      expect(
        await reader().saleForReturnInBranchOf(asking.registerId, {
          ...ticket,
          shortCode: "AAAAAAAA",
        }),
      ).toBeUndefined();
    });

    it("finds nothing for a ticket no sale has", async () => {
      const { asking } = await setUp();

      expect(await reader().saleForReturnInBranchOf(asking.registerId, INVOICE)).toBeUndefined();
    });
  });

  describe("only within the asking register's branch", () => {
    it("does not find the sale of another branch", async () => {
      const { asking, selling, completed } = await setUp({}, "UNIT", true);
      await authorizeInvoice(selling.registerId, completed.id);

      const [sold] = await system.db
        .select({ locationId: sales.locationId })
        .from(sales)
        .where(eq(sales.id, completed.id));
      expect(sold?.locationId).not.toBe(asking.locationId);
      expect(await reader().saleForReturnInBranchOf(asking.registerId, INVOICE)).toBeUndefined();
    });

    it("does not find the sale for a register that does not exist", async () => {
      const { selling, completed } = await setUp();
      await authorizeInvoice(selling.registerId, completed.id);

      expect(await reader().saleForReturnInBranchOf(randomUUID(), INVOICE)).toBeUndefined();
    });
  });

  describe("what the sale already gave back", () => {
    it("holds the returns the cloud counted, their lines, and the refunds each payment gave", async () => {
      const { asking, selling, completed, sessionId } = await setUp();
      await authorizeInvoice(selling.registerId, completed.id);
      const saleReturn = aReturnOf(completed, { sessionId });
      await record(
        { kind: "sale_returned", saleReturn },
        eventOf(selling.deviceId, "sale_returned", saleReturn.id),
      );

      const found = await reader().saleForReturnInBranchOf(asking.registerId, INVOICE);

      expect(found).toMatchObject({
        sale: {
          returned: [{ saleLineId: completed.lines[0]?.id, quantity: 1, refundedAmount: 2400 }],
          payments: [{ id: completed.payments[0]?.id, refundedAmount: 2400 }],
        },
        countedReturnIds: [saleReturn.id],
      });
    });

    it("counts a refund of another origin that is not discarded and ignores a discarded one", async () => {
      const { asking, selling, completed } = await setUp();
      await authorizeInvoice(selling.registerId, completed.id);
      const paymentId = completed.payments[0]?.id as string;
      const refund = { saleId: completed.id, paymentId, method: "CASH", provider: "NONE" };
      await system.db.insert(paymentRefunds).values([
        {
          id: randomUUID(),
          ...refund,
          amount: 300,
          state: "PENDING",
          origin: "sale_cancelled",
          occurredAt: RETURNED_AT,
        },
        {
          id: randomUUID(),
          ...refund,
          amount: 900,
          state: "DISCARDED",
          origin: "sale_cancelled",
          occurredAt: RETURNED_AT,
        },
      ]);

      const found = await reader().saleForReturnInBranchOf(asking.registerId, INVOICE);

      expect(found?.sale.payments[0]?.refundedAmount).toBe(300);
    });
  });

  describe("a sale that was voided or never completed", () => {
    it("holds a voided sale so the register can say it was voided", async () => {
      const { asking, selling, completed } = await setUp();
      await authorizeInvoice(selling.registerId, completed.id);
      await record(
        { kind: "sale_voided", creditNote: null, sale: aVoidedSaleOf(completed) },
        eventOf(selling.deviceId, "sale_voided", completed.id),
      );

      const found = await reader().saleForReturnInBranchOf(asking.registerId, INVOICE);

      expect(found?.sale.sale.state).toBe("VOIDED");
    });

    it("does not find a cancelled sale", async () => {
      const { asking, selling, sessionId } = await setUp();
      const cancelled = aCancelledSale({ sessionId });
      await record(
        { kind: "sale_cancelled", sale: cancelled },
        eventOf(selling.deviceId, "sale_cancelled", cancelled.id),
      );
      await authorizeInvoice(selling.registerId, cancelled.id);

      expect(await reader().saleForReturnInBranchOf(asking.registerId, INVOICE)).toBeUndefined();
    });
  });
});
