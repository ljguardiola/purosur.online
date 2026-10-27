import { randomUUID } from "node:crypto";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  creditNotes,
  fiscalRequests,
  offlineFiscalDocuments,
  registers,
} from "../../platform/db/schema.js";

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
