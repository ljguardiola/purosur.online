import { randomUUID } from "node:crypto";
import type { Fortnight } from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { offlineFiscalDocuments } from "../../platform/db/schema.js";

export async function insertOfflineFiscalDocument<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  {
    registerId,
    pointOfSale,
    fortnight,
    number,
    saleId = randomUUID(),
    issuedOn = fortnight.start,
  }: {
    registerId: string;
    pointOfSale: number;
    fortnight: Fortnight;
    number: number;
    saleId?: string;
    issuedOn?: string;
  },
): Promise<{ id: string; saleId: string }> {
  const id = randomUUID();
  await db.insert(offlineFiscalDocuments).values({
    id,
    saleId,
    registerId,
    pointOfSale,
    documentType: "factura_c",
    number,
    issuedOn,
    generatedAt: new Date(`${fortnight.start}T12:00:00.000Z`),
    generationStamp: `${fortnight.start.replaceAll("-", "")}090000`,
    offlineAuthorizationCode: "36123456789012",
    fortnightStart: fortnight.start,
    fortnightEnd: fortnight.end,
    buyerDocumentType: 99,
    buyerDocumentNumber: 0,
    buyerTaxStatusCode: 5,
    total: 10_000,
    netAmount: 10_000,
    cause: "no_connectivity",
    recordedAt: new Date(`${fortnight.start}T12:00:00.000Z`),
  });
  return { id, saleId };
}

export async function insertOfflineCreditNote<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  {
    registerId,
    pointOfSale,
    fortnight,
    number,
    corrects,
    saleId = randomUUID(),
    total = 10_000,
    creditNoteId = randomUUID(),
  }: {
    registerId: string;
    pointOfSale: number;
    fortnight: Fortnight;
    number: number;
    corrects: { voucherType: number; pointOfSale: number; number: number };
    saleId?: string;
    total?: number;
    creditNoteId?: string;
  },
): Promise<{ id: string; saleId: string }> {
  const id = randomUUID();
  await db.insert(offlineFiscalDocuments).values({
    id,
    saleId,
    registerId,
    pointOfSale,
    documentType: "credit_note_c",
    number,
    issuedOn: fortnight.start,
    generatedAt: new Date(`${fortnight.start}T13:00:00.000Z`),
    generationStamp: `${fortnight.start.replaceAll("-", "")}100000`,
    offlineAuthorizationCode: "36123456789012",
    fortnightStart: fortnight.start,
    fortnightEnd: fortnight.end,
    buyerDocumentType: 99,
    buyerDocumentNumber: 0,
    buyerTaxStatusCode: 5,
    total,
    netAmount: total,
    cause: "no_connectivity",
    recordedAt: new Date(`${fortnight.start}T13:00:00.000Z`),
    creditNoteId,
    correctedVoucherType: corrects.voucherType,
    correctedPointOfSale: corrects.pointOfSale,
    correctedNumber: corrects.number,
  });
  return { id, saleId };
}
