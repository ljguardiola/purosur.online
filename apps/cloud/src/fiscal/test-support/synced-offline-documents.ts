import { randomUUID } from "node:crypto";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { offlineFiscalDocuments } from "../../platform/db/schema.js";
import { type InboxEventValues, insertInboxEvent } from "../../sync/test-support/inbox-events.js";

export interface SyncedOfflineDocument {
  pointOfSale: number;
  number: number;
}

export async function insertAppliedOfflineDocument<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  registerId: string,
  { pointOfSale, number }: SyncedOfflineDocument,
): Promise<void> {
  await db.insert(offlineFiscalDocuments).values({
    id: randomUUID(),
    saleId: randomUUID(),
    registerId,
    pointOfSale,
    documentType: "factura_c",
    number,
    issuedOn: "2026-10-06",
    generatedAt: new Date("2026-10-06T11:20:00.000Z"),
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
    recordedAt: new Date("2026-10-06T15:00:00.000Z"),
  });
}

export function insertReceivedOfflineDocumentEvent<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  { deviceId, registerId }: { deviceId: string; registerId: string },
  { pointOfSale, number }: SyncedOfflineDocument,
  overrides: Partial<InboxEventValues> = {},
): Promise<string> {
  const saleId = randomUUID();
  return insertInboxEvent(db, deviceId, {
    aggregateType: "Sale",
    aggregateId: saleId,
    eventType: "offline_fiscal_document_issued",
    schemaVersion: 1,
    payload: {
      fiscal_document_id: randomUUID(),
      sale_id: saleId,
      register_id: registerId,
      point_of_sale: pointOfSale,
      document_type: "factura_c",
      number,
      issued_on: "2026-10-06",
      generated_at: "2026-10-06T11:20:00.000Z",
      generation_stamp: "20261006082000",
      offline_authorization_code: "21403471111111",
      fortnight_start: "2026-10-01",
      fortnight_end: "2026-10-15",
      buyer_document_type: 99,
      buyer_document_number: 0,
      buyer_tax_status_code: 5,
      total: 4800,
      net_amount: 4800,
      cause: "no_connectivity",
    },
    ...overrides,
  });
}
