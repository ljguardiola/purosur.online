import {
  type DeferredSale,
  FACTURA_C_DOCUMENT_TYPE,
  type FiscalDocumentState,
  IN_PROGRESS_FISCAL_DOCUMENT_STATES,
  NUMBER_CONSUMING_STATES,
  type OfflineNumberBlockRange,
  type OutboxEventDraft,
  SERIES_WAITING_STATES,
} from "@purosur/domain";
import {
  type ClockMark,
  decideSaleAuthorization,
  type FiscalDocumentReservation,
  type Fortnight,
  type OfflineFiscalDocument,
  type OfflineSeries,
  type RealTimeSeries,
  type SaleAuthorizationTransaction,
  type SaleOrigin,
  type ShortCodeRandomness,
} from "@purosur/domain/fiscal/use-cases";
import type { SaleAuthorizationDecision } from "@purosur/domain/sales/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { cryptoShortCodes } from "./crypto-short-codes";
import { insertDeferredSale } from "./sqlite-deferred-sales";
import { readFiscalOnlineEvidence } from "./sqlite-fiscal-online-evidence";

function placeholdersFor(states: readonly FiscalDocumentState[]): string {
  return states.map(() => "?").join(", ");
}

interface PointOfSaleRow {
  point_of_sale: number;
  tax_authority_count: number | null;
  tax_authority_last_issued_on: string | null;
  numbering_frozen: number;
}

interface OfflinePointOfSaleRow {
  point_of_sale_number: number;
  tax_authority_last_authorized_number: number | null;
  highest_synced_offline_number: number | null;
}

function clockMarkOf(
  database: LocalDatabase,
  pointOfSale: number,
  documentType: string,
): Date | null {
  const mark = database
    .prepare<[number, string], { reading: string }>(
      "SELECT reading FROM register_clock_marks WHERE point_of_sale = ? AND document_type = ?",
    )
    .get(pointOfSale, documentType);
  return mark === undefined ? null : new Date(mark.reading);
}

function sqliteSaleAuthorizationTransaction(
  database: LocalDatabase,
  appendOutboxEvent: (event: OutboxEventDraft) => void,
): SaleAuthorizationTransaction {
  return {
    fiscalOnlineEvidence: () => readFiscalOnlineEvidence(database),

    realTimeSeries(): RealTimeSeries {
      const pointOfSale = database
        .prepare<[], PointOfSaleRow>(
          `SELECT register_point_of_sale.point_of_sale_number AS point_of_sale,
                  register_point_of_sale.tax_authority_last_authorized_number AS tax_authority_count,
                  register_point_of_sale.tax_authority_last_authorized_issued_on AS tax_authority_last_issued_on,
                  register_point_of_sale.numbering_frozen
           FROM register_point_of_sale
           JOIN own_register ON own_register.id = register_point_of_sale.register_id
           WHERE own_register.removed = 0`,
        )
        .get();
      if (pointOfSale === undefined) {
        return {
          pointOfSale: null,
          localLastAuthorized: null,
          taxAuthorityLastAuthorized: null,
          documentRequesting: false,
          documentUnknown: false,
          numberingFrozen: false,
          clockMark: null,
          taxAuthorityLastIssuedOn: null,
        };
      }
      const local = database
        .prepare<(number | string)[], { last_authorized: number | null }>(
          `SELECT max(number) AS last_authorized FROM fiscal_documents
           WHERE point_of_sale = ? AND document_type = ?
             AND state IN (${placeholdersFor(NUMBER_CONSUMING_STATES)})`,
        )
        .get(pointOfSale.point_of_sale, FACTURA_C_DOCUMENT_TYPE, ...NUMBER_CONSUMING_STATES);
      const waiting = database
        .prepare<(number | string)[], { state: FiscalDocumentState }>(
          `SELECT state FROM fiscal_documents
           WHERE point_of_sale = ? AND document_type = ?
             AND state IN (${placeholdersFor(SERIES_WAITING_STATES)})`,
        )
        .get(pointOfSale.point_of_sale, FACTURA_C_DOCUMENT_TYPE, ...SERIES_WAITING_STATES);
      return {
        pointOfSale: pointOfSale.point_of_sale,
        localLastAuthorized: local?.last_authorized ?? null,
        taxAuthorityLastAuthorized: pointOfSale.tax_authority_count,
        numberingFrozen: pointOfSale.numbering_frozen === 1,
        clockMark: clockMarkOf(database, pointOfSale.point_of_sale, FACTURA_C_DOCUMENT_TYPE),
        taxAuthorityLastIssuedOn: pointOfSale.tax_authority_last_issued_on,
        documentRequesting:
          waiting !== undefined && IN_PROGRESS_FISCAL_DOCUMENT_STATES.includes(waiting.state),
        documentUnknown:
          waiting !== undefined && !IN_PROGRESS_FISCAL_DOCUMENT_STATES.includes(waiting.state),
      };
    },

    offlineSeries(): OfflineSeries {
      const offlinePointOfSale = database
        .prepare<[], OfflinePointOfSaleRow>(
          `SELECT point_of_sale_number, tax_authority_last_authorized_number, highest_synced_offline_number
           FROM register_offline_point_of_sale`,
        )
        .get();
      if (offlinePointOfSale === undefined) {
        return {
          pointOfSale: null,
          blocksInAssignmentOrder: [],
          localLastUsed: null,
          taxAuthorityLastAuthorized: null,
          highestSyncedNumber: null,
          clockMark: null,
        };
      }
      const pointOfSale = offlinePointOfSale.point_of_sale_number;
      const blocks = database
        .prepare<[number, string], OfflineNumberBlockRange>(
          `SELECT first_number AS firstNumber, last_number AS lastNumber
           FROM offline_number_blocks
           WHERE point_of_sale = ? AND document_type = ?
           ORDER BY first_number`,
        )
        .all(pointOfSale, FACTURA_C_DOCUMENT_TYPE);
      const lastUsed = database
        .prepare<[number, string], { last_number: number | null }>(
          `SELECT max(number) AS last_number FROM offline_fiscal_documents
           WHERE point_of_sale = ? AND document_type = ?`,
        )
        .get(pointOfSale, FACTURA_C_DOCUMENT_TYPE);
      return {
        pointOfSale,
        blocksInAssignmentOrder: blocks,
        localLastUsed: lastUsed?.last_number ?? null,
        taxAuthorityLastAuthorized: offlinePointOfSale.tax_authority_last_authorized_number,
        highestSyncedNumber: offlinePointOfSale.highest_synced_offline_number,
        clockMark: clockMarkOf(database, pointOfSale, FACTURA_C_DOCUMENT_TYPE),
      };
    },

    offlineAuthorizationCodeOf({ start }: Fortnight): string | null {
      const held = database
        .prepare<[string], { code: string }>(
          "SELECT code FROM offline_authorization_codes WHERE fortnight_start = ?",
        )
        .get(start);
      return held?.code ?? null;
    },

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
