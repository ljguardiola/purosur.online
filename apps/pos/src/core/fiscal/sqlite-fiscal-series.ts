import {
  FACTURA_C_DOCUMENT_TYPE,
  type FiscalDocumentState,
  IN_PROGRESS_FISCAL_DOCUMENT_STATES,
  NUMBER_CONSUMING_STATES,
  type OfflineNumberBlockRange,
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

export function latestClockCorrectionOf(
  database: LocalDatabase,
  pointOfSale: number,
  documentType: string,
): ClockCorrectionReadings | null {
  const correction = database
    .prepare<[number, string], { previous_reading: string; corrected_reading: string }>(
      `SELECT previous_reading, corrected_reading FROM clock_corrections
       WHERE point_of_sale = ? AND document_type = ?
       ORDER BY corrected_reading DESC, id DESC LIMIT 1`,
    )
    .get(pointOfSale, documentType);
  return correction === undefined
    ? null
    : {
        previousReading: new Date(correction.previous_reading),
        correctedReading: new Date(correction.corrected_reading),
      };
}

export function readRealTimeSeries(database: LocalDatabase): RealTimeSeries {
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
      latestClockCorrection: null,
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
    latestClockCorrection: latestClockCorrectionOf(
      database,
      pointOfSale.point_of_sale,
      FACTURA_C_DOCUMENT_TYPE,
    ),
    documentRequesting:
      waiting !== undefined && IN_PROGRESS_FISCAL_DOCUMENT_STATES.includes(waiting.state),
    documentUnknown:
      waiting !== undefined && !IN_PROGRESS_FISCAL_DOCUMENT_STATES.includes(waiting.state),
  };
}

export function readOfflineSeries(database: LocalDatabase): OfflineSeries {
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
