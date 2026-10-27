import {
  DEFERRED_RETRY_DELAYING_STATES,
  type DeferredBacklogEntry,
  FACTURA_C_DOCUMENT_TYPE,
  type FiscalDocumentState,
  IN_PROGRESS_FISCAL_DOCUMENT_STATES,
  NUMBER_CONSUMING_STATES,
  type OfflineNumberBlockRange,
  type OfflineSeriesDocumentType,
  SERIES_WAITING_STATES,
} from "@purosur/domain";
import type {
  ClockCorrectionReadings,
  Fortnight,
  OfflineSeries,
  RealTimeSeries,
} from "@purosur/domain/fiscal/use-cases";
import type { LocalDatabase } from "../platform/local-database";

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

export function clockMarkOf(
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

export function clockCorrectionsOf(
  database: LocalDatabase,
  pointOfSale: number,
  documentType: string,
): ClockCorrectionReadings[] {
  return database
    .prepare<[number, string], { previous_reading: string; corrected_reading: string }>(
      `SELECT previous_reading, corrected_reading FROM clock_corrections
       WHERE point_of_sale = ? AND document_type = ?
       ORDER BY id`,
    )
    .all(pointOfSale, documentType)
    .map((correction) => ({
      previousReading: new Date(correction.previous_reading),
      correctedReading: new Date(correction.corrected_reading),
    }));
}

interface DeferredBacklogRow {
  deferred_sale_id: string;
  sale_id: string;
  occurred_at: string;
  routed_at: string;
  total: number;
  last_attempt_ended_at: string | null;
}

function readDeferredBacklog(database: LocalDatabase): DeferredBacklogEntry[] {
  return database
    .prepare<FiscalDocumentState[], DeferredBacklogRow>(
      `SELECT deferred_sales.id AS deferred_sale_id,
              deferred_sales.sale_id,
              deferred_sales.occurred_at,
              deferred_sales.routed_at,
              deferred_sales.total,
              (SELECT max(attempt.resolved_at) FROM fiscal_documents AS attempt
                WHERE attempt.sale_id = deferred_sales.sale_id
                  AND attempt.state IN (${placeholdersFor(DEFERRED_RETRY_DELAYING_STATES)})) AS last_attempt_ended_at
       FROM deferred_sales
       WHERE deferred_sales.satisfied_at IS NULL
         AND deferred_sales.cancelled_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM fiscal_documents AS held
           WHERE held.sale_id = deferred_sales.sale_id AND held.state = 'AUTHORIZED')
         AND NOT EXISTS (
           SELECT 1 FROM offline_fiscal_documents AS offline
           WHERE offline.sale_id = deferred_sales.sale_id)
       ORDER BY deferred_sales.occurred_at, deferred_sales.routed_at, deferred_sales.id`,
    )
    .all(...DEFERRED_RETRY_DELAYING_STATES)
    .map((row) => ({
      deferredSaleId: row.deferred_sale_id,
      saleId: row.sale_id,
      occurredAt: new Date(row.occurred_at),
      routedAt: new Date(row.routed_at),
      total: row.total,
      lastAttemptEndedAt:
        row.last_attempt_ended_at === null ? null : new Date(row.last_attempt_ended_at),
    }));
}

export function readRealTimeSeries(database: LocalDatabase): RealTimeSeries {
  const deferredBacklog = readDeferredBacklog(database);
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
      clockCorrections: [],
      localLastAuthorizedIssuedOn: null,
      deferredBacklog,
    };
  }
  const local = database
    .prepare<(number | string)[], { last_authorized: number | null }>(
      `SELECT max(number) AS last_authorized FROM fiscal_documents
       WHERE point_of_sale = ? AND document_type = ?
         AND state IN (${placeholdersFor(NUMBER_CONSUMING_STATES)})`,
    )
    .get(pointOfSale.point_of_sale, FACTURA_C_DOCUMENT_TYPE, ...NUMBER_CONSUMING_STATES);
  const lastAuthorizedIssued = database
    .prepare<[number, string], { issued_on: string | null }>(
      `SELECT max(issued_on) AS issued_on FROM fiscal_documents
       WHERE point_of_sale = ? AND document_type = ? AND state = 'AUTHORIZED'`,
    )
    .get(pointOfSale.point_of_sale, FACTURA_C_DOCUMENT_TYPE);
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
    clockCorrections: clockCorrectionsOf(
      database,
      pointOfSale.point_of_sale,
      FACTURA_C_DOCUMENT_TYPE,
    ),
    localLastAuthorizedIssuedOn: lastAuthorizedIssued?.issued_on ?? null,
    deferredBacklog,
    documentRequesting:
      waiting !== undefined && IN_PROGRESS_FISCAL_DOCUMENT_STATES.includes(waiting.state),
    documentUnknown:
      waiting !== undefined && !IN_PROGRESS_FISCAL_DOCUMENT_STATES.includes(waiting.state),
  };
}

function readOfflineCounts(
  database: LocalDatabase,
  documentType: OfflineSeriesDocumentType,
): OfflinePointOfSaleRow | undefined {
  const offlinePointOfSale = database
    .prepare<[], { point_of_sale_number: number }>(
      "SELECT point_of_sale_number FROM register_offline_point_of_sale",
    )
    .get();
  if (offlinePointOfSale === undefined) {
    return undefined;
  }
  const counts = database
    .prepare<[number, string], Omit<OfflinePointOfSaleRow, "point_of_sale_number">>(
      `SELECT tax_authority_last_authorized_number, highest_synced_offline_number
       FROM offline_series_counts WHERE point_of_sale = ? AND document_type = ?`,
    )
    .get(offlinePointOfSale.point_of_sale_number, documentType);
  return {
    point_of_sale_number: offlinePointOfSale.point_of_sale_number,
    tax_authority_last_authorized_number: counts?.tax_authority_last_authorized_number ?? null,
    highest_synced_offline_number: counts?.highest_synced_offline_number ?? null,
  };
}

export function readOfflineSeries(
  database: LocalDatabase,
  documentType: OfflineSeriesDocumentType = FACTURA_C_DOCUMENT_TYPE,
): OfflineSeries {
  const offlinePointOfSale = readOfflineCounts(database, documentType);
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
    .all(pointOfSale, documentType);
  const lastUsed = database
    .prepare<[number, string], { last_number: number | null }>(
      `SELECT max(number) AS last_number FROM offline_fiscal_documents
       WHERE point_of_sale = ? AND document_type = ?`,
    )
    .get(pointOfSale, documentType);
  return {
    pointOfSale,
    blocksInAssignmentOrder: blocks,
    localLastUsed: lastUsed?.last_number ?? null,
    taxAuthorityLastAuthorized: offlinePointOfSale.tax_authority_last_authorized_number,
    highestSyncedNumber: offlinePointOfSale.highest_synced_offline_number,
    clockMark: clockMarkOf(database, pointOfSale, documentType),
  };
}

export function readOfflineAuthorizationCodeOf(
  database: LocalDatabase,
  { start }: Fortnight,
): string | null {
  const held = database
    .prepare<[string], { code: string }>(
      "SELECT code FROM offline_authorization_codes WHERE fortnight_start = ?",
    )
    .get(start);
  return held?.code ?? null;
}
