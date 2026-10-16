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
  }: {
    registerId: string;
    pointOfSale: number;
    fortnight: Fortnight;
    number: number;
    saleId?: string;
  },
): Promise<void> {
  await db.insert(offlineFiscalDocuments).values({
    id: randomUUID(),
    saleId,
    registerId,
    pointOfSale,
    documentType: "factura_c",
    number,
    issuedOn: fortnight.start,
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
}
