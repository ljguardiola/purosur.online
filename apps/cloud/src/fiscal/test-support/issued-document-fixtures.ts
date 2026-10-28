import { randomUUID } from "node:crypto";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  cashSessions,
  categories,
  creditNotes,
  discounts,
  fiscalRequests,
  offlineFiscalDocuments,
  registers,
  saleLines,
  salePayments,
  sales,
} from "../../platform/db/schema.js";
import { seededLocationId } from "../../test-support/seeded-location.js";

type Db = PgDatabase<PgQueryResultHKT>;

let nextNumber = 1;

export async function insertRegisterOf(db: Db, locationId: string, name: string): Promise<string> {
  const [register] = await db
    .insert(registers)
    .values({ locationId, name })
    .returning({ id: registers.id });
  if (!register) {
    throw new Error("test setup: seeding the register returned no row");
  }
  return register.id;
}

export async function insertReceiptRequest(
  db: Db,
  registerId: string,
  overrides: Partial<typeof fiscalRequests.$inferInsert> = {},
): Promise<void> {
  const number = nextNumber++;
  await db.insert(fiscalRequests).values({
    fiscalDocumentId: randomUUID(),
    registerId,
    saleId: randomUUID(),
    pointOfSale: 7,
    number,
    issuedOn: "2026-10-05",
    total: 4_800,
    buyerTaxStatusCode: 5,
    receivedAt: new Date("2026-10-05T13:00:00.000Z"),
    notAfter: new Date("2026-10-05T13:01:00.000Z"),
    answerKind: "authorized",
    authorizationCode: "75123456789012",
    authorizationCodeDueOn: "2026-10-15",
    answeredAt: new Date("2026-10-05T13:00:02.000Z"),
    ...overrides,
  });
}

export async function insertOnlineCreditNote(
  db: Db,
  registerId: string,
  overrides: Partial<typeof creditNotes.$inferInsert> = {},
): Promise<void> {
  const number = nextNumber++;
  await db.insert(creditNotes).values({
    id: randomUUID(),
    registerId,
    saleId: randomUUID(),
    reason: "sale_void",
    pointOfSale: 7,
    associatedVoucherType: 11,
    associatedPointOfSale: 7,
    associatedNumber: number,
    total: 4_800,
    receiverTaxStatusCode: 5,
    number,
    issuedOn: "2026-10-05",
    requestedAt: new Date("2026-10-05T14:00:00.000Z"),
    answerKind: "authorized",
    answeredAt: new Date("2026-10-05T14:00:02.000Z"),
    authorizationCode: "75123456789099",
    authorizationCodeDueOn: "2026-10-15",
    createdAt: new Date("2026-10-05T13:59:00.000Z"),
    ...overrides,
  });
}

export async function insertCaeaDocument(
  db: Db,
  registerId: string,
  overrides: Partial<typeof offlineFiscalDocuments.$inferInsert> = {},
): Promise<void> {
  const number = nextNumber++;
  await db.insert(offlineFiscalDocuments).values({
    id: randomUUID(),
    saleId: randomUUID(),
    registerId,
    pointOfSale: 8,
    documentType: "factura_c",
    number,
    issuedOn: "2026-10-05",
    generatedAt: new Date("2026-10-05T15:00:00.000Z"),
    generationStamp: "20261005120000",
    offlineAuthorizationCode: "21403471111111",
    fortnightStart: "2026-10-01",
    fortnightEnd: "2026-10-15",
    buyerDocumentType: 99,
    buyerDocumentNumber: 0,
    buyerTaxStatusCode: 5,
    total: 3_000,
    netAmount: 3_000,
    cause: "no_connectivity",
    recordedAt: new Date("2026-10-05T15:30:00.000Z"),
    ...overrides,
  });
}

export async function insertSoldLine(
  db: Db,
  saleId: string,
  overrides: Partial<typeof saleLines.$inferInsert> = {},
): Promise<void> {
  await db.insert(saleLines).values({
    id: randomUUID(),
    saleId,
    productId: randomUUID(),
    productName: "Yerba 1 kg",
    quantity: 1,
    listUnitPrice: 1_500,
    priceListId: randomUUID(),
    discountAmount: 0,
    lineTotal: 1_500,
    ...overrides,
  });
}

export async function insertSalePayment(
  db: Db,
  saleId: string,
  overrides: Partial<typeof salePayments.$inferInsert> = {},
): Promise<void> {
  await db.insert(salePayments).values({
    id: randomUUID(),
    saleId,
    method: "CASH",
    provider: "NONE",
    amount: 1_500,
    state: "APPROVED",
    occurredAt: new Date("2026-10-05T13:00:00.000Z"),
    ...overrides,
  });
}

export async function insertPromotion(db: Db, name: string): Promise<string> {
  const [category] = await db
    .insert(categories)
    .values({ name: `Categoría de ${name}` })
    .returning({ id: categories.id });
  if (!category) {
    throw new Error("test setup: seeding the category returned no row");
  }
  const [promotion] = await db
    .insert(discounts)
    .values({
      name,
      categoryId: category.id,
      kind: "PERCENT_OFF",
      percent: 10,
      validFrom: "2026-10-01",
      validTo: "2026-10-31",
    })
    .returning({ id: discounts.id });
  if (!promotion) {
    throw new Error("test setup: seeding the promotion returned no row");
  }
  return promotion.id;
}

export async function insertCompletedSale(
  db: Db,
  {
    saleId,
    registerId,
    deviceId,
    at,
    total = 1_500,
  }: { saleId: string; registerId: string; deviceId: string; at: Date; total?: number },
): Promise<void> {
  const origin = { locationId: await seededLocationId(db), registerId, deviceId };
  const sessionId = randomUUID();
  const actorId = randomUUID();
  await db
    .insert(cashSessions)
    .values({ id: sessionId, ...origin, openedBy: actorId, openedAt: at, openingFloat: 0 });
  await db.insert(sales).values({
    id: saleId,
    ...origin,
    sessionId,
    actorId,
    state: "COMPLETED",
    completedAt: at,
    total,
    appliedAt: at,
  });
}
