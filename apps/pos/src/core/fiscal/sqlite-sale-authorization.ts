import { type DeferredSale, FACTURA_C_DOCUMENT_TYPE, type OutboxEventDraft } from "@purosur/domain";
import {
  type ClockMark,
  decideSaleAuthorization,
  type FiscalDocumentReservation,
  type Fortnight,
  type OfflineFiscalDocument,
  type SaleAuthorizationTransaction,
  type SaleOrigin,
  type ShortCodeRandomness,
} from "@purosur/domain/fiscal/use-cases";
import type { SaleAuthorizationDecision } from "@purosur/domain/sales/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { cryptoShortCodes } from "./crypto-short-codes";
import { insertDeferredSale } from "./sqlite-deferred-sales";
import { readFiscalOnlineEvidence } from "./sqlite-fiscal-online-evidence";
import {
  readOfflineAuthorizationCodeOf,
  readOfflineSeries,
  readRealTimeSeries,
} from "./sqlite-fiscal-series";

function sqliteSaleAuthorizationTransaction(
  database: LocalDatabase,
  appendOutboxEvent: (event: OutboxEventDraft) => void,
): SaleAuthorizationTransaction {
  return {
    fiscalOnlineEvidence: () => readFiscalOnlineEvidence(database),

    realTimeSeries: () => readRealTimeSeries(database),

    offlineSeries: () => readOfflineSeries(database),

    offlineAuthorizationCodeOf: (fortnight: Fortnight) =>
      readOfflineAuthorizationCodeOf(database, fortnight),

    originOfSale(saleId: string): SaleOrigin {
      const origin = database
        .prepare<[string], { register_id: string; actor_id: string }>(
          "SELECT register_id, actor_id FROM sales WHERE id = ?",
        )
        .get(saleId);
      if (origin === undefined) {
        throw new Error(`the sale ${saleId} does not exist`);
      }
      return { registerId: origin.register_id, actorId: origin.actor_id };
    },

    reserveFiscalDocument(reservation: FiscalDocumentReservation): void {
      database
        .prepare(
          `INSERT INTO fiscal_documents (
             id, sale_id, point_of_sale, document_type, number, issued_on, document, state, reserved_at
           ) VALUES (
             @id, @sale_id, @point_of_sale, @document_type, @number, @issued_on, @document,
             'REQUESTING', @reserved_at
           )`,
        )
        .run({
          id: reservation.id,
          sale_id: reservation.saleId,
          point_of_sale: reservation.pointOfSale,
          document_type: FACTURA_C_DOCUMENT_TYPE,
          number: reservation.number,
          issued_on: reservation.issuedOn,
          document: JSON.stringify(reservation.document),
          reserved_at: reservation.reservedAt.toISOString(),
        });
    },

    issueOfflineFiscalDocument(document: OfflineFiscalDocument): void {
      database
        .prepare(
          `INSERT INTO offline_fiscal_documents (
             id, sale_id, point_of_sale, document_type, number, issued_on, generated_at,
             generation_stamp, offline_authorization_code, fortnight_start, fortnight_end, document,
             buyer_document_type, buyer_document_number, cause
           ) VALUES (
             @id, @sale_id, @point_of_sale, @document_type, @number, @issued_on, @generated_at,
             @generation_stamp, @offline_authorization_code, @fortnight_start, @fortnight_end,
             @document, @buyer_document_type, @buyer_document_number, @cause
           )`,
        )
        .run({
          id: document.id,
          sale_id: document.saleId,
          point_of_sale: document.pointOfSale,
          document_type: document.documentType,
          number: document.number,
          issued_on: document.issuedOn,
          generated_at: document.generatedAt.toISOString(),
          generation_stamp: document.generationStamp,
          offline_authorization_code: document.offlineAuthorizationCode,
          fortnight_start: document.fortnight.start,
          fortnight_end: document.fortnight.end,
          document: JSON.stringify(document.document),
          buyer_document_type: document.buyerDocumentType,
          buyer_document_number: document.buyerDocumentNumber,
          cause: document.cause,
        });
    },

    recordClockMark({ pointOfSale, documentType, reading }: ClockMark): void {
      database
        .prepare(
          `INSERT INTO register_clock_marks (point_of_sale, document_type, reading)
           VALUES (@point_of_sale, @document_type, @reading)
           ON CONFLICT (point_of_sale, document_type) DO UPDATE SET reading = excluded.reading`,
        )
        .run({
          point_of_sale: pointOfSale,
          document_type: documentType,
          reading: reading.toISOString(),
        });
    },

    appendOutboxEvent,

    routeSaleToDeferred(deferred: DeferredSale): void {
      insertDeferredSale(database, deferred);
    },
  };
}

export function decideSaleAuthorizationIn(
  database: LocalDatabase,
  { ids, saleId, gate, decidedAt, occurredAt, total }: SaleAuthorizationDecision,
  appendOutboxEvent: (event: OutboxEventDraft) => void,
  shortCodes: ShortCodeRandomness = cryptoShortCodes,
): void {
  decideSaleAuthorization(
    sqliteSaleAuthorizationTransaction(database, appendOutboxEvent),
    ids,
    shortCodes,
    {
      saleId,
      gate,
      decidedAt,
      occurredAt,
      total,
    },
  );
}
