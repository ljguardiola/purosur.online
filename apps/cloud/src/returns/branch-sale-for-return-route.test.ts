import { randomUUID } from "node:crypto";
import { branchSaleForReturnAnswerSchema, cloudErrorSchema } from "@purosur/contracts";
import { unappliedEventOf } from "@purosur/contracts/sync/test-support/unapplied-event";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  categories,
  fiscalRequests,
  locations,
  products,
  registers,
  users,
} from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { DrizzleEventApplication } from "../sync/drizzle-event-application.js";
import {
  aCashSessionOpenedFact,
  aCompletedSale,
  aVoidedSaleOf,
} from "../sync/test-support/synced-facts.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { buildBranchSaleForReturnRouteApp } from "./test-support/branch-sale-for-return-route.js";

const NOW = new Date("2026-10-15T15:00:00.000Z");
const COMPLETED_AT = new Date("2026-10-06T11:20:00.000Z");
const CASHIER = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";
const PATH = "/devices/current/returns/sale";
const INVOICE_QUERY = "?point_of_sale=7&number=42";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  app = buildBranchSaleForReturnRouteApp(db, { now: () => NOW });
});

afterEach(async () => {
  await app.close();
});

function get(query: string, authorization?: string) {
  return app.inject({
    method: "GET",
    url: `${PATH}${query}`,
    ...(authorization !== undefined && { headers: { authorization } }),
  });
}

function record(deviceId: string, fact: SyncedFact, eventType: string, aggregateId: string) {
  const application = new DrizzleEventApplication(
    db,
    () => NOW,
    async () => {},
  );
  return application.transaction((tx) =>
    tx.record(
      fact,
      unappliedEventOf(
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
      ),
    ),
  );
}

async function ringUpOnAnotherRegister(options: { voided?: boolean; otherBranch?: boolean } = {}) {
  const asking = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 1" });
  let selling = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
  if (options.otherBranch) {
    const [branch] = await db.insert(locations).values({}).returning({ id: locations.id });
    const [register] = await db
      .insert(registers)
      .values({ locationId: branch?.id as string, name: "Caja 3" })
      .returning({ id: registers.id });
    selling = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: register?.id as string,
    });
  }
  await db.insert(users).values({
    id: CASHIER,
    firstName: "Ada",
    email: "ada@example.com",
    locationId: selling.locationId,
  });
  const [category] = await db
    .insert(categories)
    .values({ name: "Almacen" })
    .returning({ id: categories.id });
  const [product] = await db
    .insert(products)
    .values({ name: "Azucar", categoryId: category?.id as string, saleUnit: "UNIT" })
    .returning({ id: products.id });
  const sessionId = randomUUID();
  await record(
    selling.deviceId,
    aCashSessionOpenedFact({ id: sessionId, openedAt: COMPLETED_AT }),
    "cash_session_opened",
    sessionId,
  );
  const base = aCompletedSale({ sessionId, completedAt: COMPLETED_AT });
  const [line] = base.lines;
  const completed = {
    ...base,
    lines: [{ ...(line as NonNullable<typeof line>), productId: product?.id as string }],
  };
  await record(
    selling.deviceId,
    { kind: "sale_completed", sale: completed },
    "sale_completed",
    completed.id,
  );
  if (options.voided) {
    await record(
      selling.deviceId,
      { kind: "sale_voided", creditNote: null, sale: aVoidedSaleOf(completed) },
      "sale_voided",
      completed.id,
    );
  }
  await db.insert(fiscalRequests).values({
    fiscalDocumentId: randomUUID(),
    registerId: selling.registerId,
    saleId: completed.id,
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
  });
  return { asking, selling, completed };
}

describe("GET /devices/current/returns/sale", () => {
  it("answers an unauthenticated request with device_token_rejected, even for a query it could not read", async () => {
    const response = await get("");

    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toBe("Bearer");
    expect(cloudErrorSchema.parse(response.json()).code).toBe("device_token_rejected");
  });

  it("answers an unknown device token with device_token_rejected before reading any sale", async () => {
    await ringUpOnAnotherRegister();

    const response = await get(INVOICE_QUERY, "Bearer nope.nope");

    expect(response.statusCode).toBe(401);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("device_token_rejected");
  });

  it("refuses a revoked installation", async () => {
    const revoked = await insertEnrolledInstallation(db, { now: NOW, revokedAt: NOW });

    const response = await get(INVOICE_QUERY, `Bearer ${revoked.deviceToken}`);

    expect(response.statusCode).toBe(401);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("device_token_rejected");
  });

  it("refuses a query that names no ticket", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });

    const response = await get("?point_of_sale=7", `Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(400);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("validation_failed");
  });

  it("answers the facts of a sale rung up on another register of the branch", async () => {
    const { asking, completed, selling } = await ringUpOnAnotherRegister();

    const response = await get(INVOICE_QUERY, `Bearer ${asking.deviceToken}`);

    expect(response.statusCode).toBe(200);
    expect(branchSaleForReturnAnswerSchema.parse(response.json())).toMatchObject({
      sale: { id: completed.id, register_id: selling.registerId, state: "COMPLETED" },
      invoice: { point_of_sale: 7, number: 42 },
      invoice_standing: {
        fiscal_documents: [
          {
            origin: "real_time",
            state: "AUTHORIZED",
            point_of_sale: 7,
            number: 42,
            buyer_tax_status_code: 5,
          },
        ],
        deferral_pending: false,
      },
      counted_return_ids: [],
    });
  });

  it("answers only the invoices a credit note is routed by", async () => {
    const { asking, completed, selling } = await ringUpOnAnotherRegister();
    await db.insert(fiscalRequests).values({
      fiscalDocumentId: randomUUID(),
      registerId: selling.registerId,
      saleId: completed.id,
      pointOfSale: 7,
      number: 41,
      issuedOn: "2026-10-06",
      total: 4800,
      buyerTaxStatusCode: 5,
      receivedAt: COMPLETED_AT,
      notAfter: COMPLETED_AT,
      answerKind: "rejected",
      rejectionCodes: [10015],
      rejectionClass: "content",
      answeredAt: COMPLETED_AT,
    });

    const response = await get(INVOICE_QUERY, `Bearer ${asking.deviceToken}`);

    expect(
      branchSaleForReturnAnswerSchema
        .parse(response.json())
        .invoice_standing.fiscal_documents.map(({ number }) => number),
    ).toEqual([42]);
  });

  it("answers a voided sale as voided so the register can say so", async () => {
    const { asking } = await ringUpOnAnotherRegister({ voided: true });

    const response = await get(INVOICE_QUERY, `Bearer ${asking.deviceToken}`);

    expect(response.statusCode).toBe(200);
    expect(branchSaleForReturnAnswerSchema.parse(response.json()).sale.state).toBe("VOIDED");
  });

  it("answers not_found for a ticket no sale of the branch has", async () => {
    const { asking } = await ringUpOnAnotherRegister();

    const response = await get("?point_of_sale=7&number=43", `Bearer ${asking.deviceToken}`);

    expect(response.statusCode).toBe(404);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("not_found");
  });

  it("answers not_found for the sale of another branch", async () => {
    const { asking } = await ringUpOnAnotherRegister({ otherBranch: true });

    const response = await get(INVOICE_QUERY, `Bearer ${asking.deviceToken}`);

    expect(response.statusCode).toBe(404);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("not_found");
  });
});
