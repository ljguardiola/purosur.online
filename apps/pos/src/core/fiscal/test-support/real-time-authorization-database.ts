import type {
  DeferralReason,
  DeferredSale,
  DeferredSaleReference,
  FacturaC,
  FiscalDocumentState,
} from "@purosur/domain";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import type { LocalDatabase } from "../../platform/local-database";
import { appendOutboxEvent } from "../../sync/sqlite-outbox";
import {
  CHAIN_KEY,
  openOutboxDatabase,
  outboxEventDraft,
} from "../../sync/test-support/sqlite-local-outbox";

export const POINT_OF_SALE = 12;

export const OFFLINE_POINT_OF_SALE = 31;

export const FACTURA_C: FacturaC = {
  invoiceClass: "C",
  total: 12_500,
  netAmount: 12_500,
  vatAmount: 0,
  issuer: {
    legalName: FICTIONAL_LEGAL_NAME,
    cuit: FICTIONAL_CUIT,
    taxStatus: "MONOTRIBUTO",
    grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
    activityStartDate: "2020-01-01",
    version: 3,
  },
  buyerTaxStatusCode: 5,
  buyerTaxStatusDescription: "Consumidor Final",
};

export function openFiscalDatabase(): LocalDatabase {
  const database = openOutboxDatabase();
  database.exec(
    `INSERT INTO own_register (id, name, version) VALUES ('register-1', 'Caja 1', 1);
     INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
     VALUES ('session-1', 'register-1', 'device-a', 'u1', '2026-09-30T08:00:00.000Z', 0, 'OPEN');`,
  );
  return database;
}

export function insertCompletedSale(database: LocalDatabase, saleId: string): void {
  database
    .prepare(
      `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
       VALUES (?, 'register-1', 'device-a', 'session-1', 'u1', 'COMPLETED', '2026-09-30T12:05:00.000Z')`,
    )
    .run(saleId);
}

export function insertSaleCompletedEvent(database: LocalDatabase, saleId: string): void {
  appendOutboxEvent(database, CHAIN_KEY, {
    ...outboxEventDraft(1),
    event_id: `event-of-${saleId}`,
    aggregate_type: "Sale",
    aggregate_id: saleId,
    event_type: "sale_completed",
    payload: { id: saleId, total: FACTURA_C.total },
  });
}

export function insertPointOfSale(
  database: LocalDatabase,
  taxAuthorityLastAuthorized: number | null,
  pointOfSale = POINT_OF_SALE,
  numberingFrozen = false,
): void {
  database
    .prepare(
      `INSERT INTO register_point_of_sale (
         register_id, point_of_sale_number, fiscal_address_id, tax_authority_last_authorized_number,
         numbering_frozen, version
       ) VALUES ('register-1', ?, 'address-1', ?, ?, 1)`,
    )
    .run(pointOfSale, taxAuthorityLastAuthorized, numberingFrozen ? 1 : 0);
}

export interface HealthCheckRow {
  checkedAt: string;
  roundTripMs: number;
  tokenValid: boolean;
  arcaReachable: boolean;
}

export function insertHealthCheck(
  database: LocalDatabase,
  {
    checkedAt = "2026-09-30T12:04:58.000Z",
    roundTripMs = 120,
    tokenValid = true,
    arcaReachable = true,
  }: Partial<HealthCheckRow> = {},
): void {
  database
    .prepare(
      `INSERT INTO register_health_checks (checked_at, round_trip_ms, token_valid, arca_reachable)
       VALUES (?, ?, ?, ?)`,
    )
    .run(checkedAt, roundTripMs, tokenValid ? 1 : 0, arcaReachable ? 1 : 0);
}

export interface FiscalDocumentRow {
  id: string;
  saleId: string;
  pointOfSale: number;
  number: number;
  state: FiscalDocumentState;
}

export function insertFiscalDocument(
  database: LocalDatabase,
  {
    id = "doc-1",
    saleId = "sale-1",
    pointOfSale = POINT_OF_SALE,
    number = 41,
    state = "REQUESTING",
  }: Partial<FiscalDocumentRow> = {},
): void {
  database
    .prepare(
      `INSERT INTO fiscal_documents (
         id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
         authorization_code, authorization_code_due_on, reserved_at, resolved_at
       ) VALUES (
         @id, @sale_id, @point_of_sale, 'factura_c', @number, '2026-09-30', @document, @state,
         @code, @due_on, '2026-09-30T12:05:00.000Z', @resolved_at
       )`,
    )
    .run({
      id,
      sale_id: saleId,
      point_of_sale: pointOfSale,
      number,
      document: JSON.stringify(FACTURA_C),
      state,
      code: state === "AUTHORIZED" ? "75123456789012" : null,
      due_on: state === "AUTHORIZED" ? "2026-10-10" : null,
      resolved_at: state === "REQUESTING" ? null : "2026-09-30T12:05:01.000Z",
    });
}

export function insertOfflinePointOfSale(
  database: LocalDatabase,
  pointOfSale = POINT_OF_SALE,
  taxAuthorityLastAuthorizedNumber: number | null = 0,
): void {
  database
    .prepare(
      `INSERT INTO register_offline_point_of_sale (
         register_id, point_of_sale_number, tax_authority_last_authorized_number, version
       ) VALUES ('register-1', ?, ?, 1)`,
    )
    .run(pointOfSale, taxAuthorityLastAuthorizedNumber);
}

export function insertOfflineNumberBlock(
  database: LocalDatabase,
  id: string,
  firstNumber: number,
  lastNumber: number,
  pointOfSale = POINT_OF_SALE,
): void {
  database
    .prepare(
      `INSERT INTO offline_number_blocks (
         id, point_of_sale, document_type, first_number, last_number, status, version
       ) VALUES (?, ?, 'factura_c', ?, ?, 'in_use', 1)`,
    )
    .run(id, pointOfSale, firstNumber, lastNumber);
}

export const OFFLINE_CODE = "36251478963214";

export function insertOfflineAuthorizationCode(
  database: LocalDatabase,
  {
    code = OFFLINE_CODE,
    fortnightStart = "2026-09-16",
    fortnightEnd = "2026-09-30",
  }: { code?: string; fortnightStart?: string; fortnightEnd?: string } = {},
): void {
  database
    .prepare(
      `INSERT INTO offline_authorization_codes (
         fortnight_start, fortnight_end, code, report_deadline, version
       ) VALUES (?, ?, ?, '2026-10-10', 1)`,
    )
    .run(fortnightStart, fortnightEnd, code);
}

export interface OfflineFiscalDocumentRow {
  id: string;
  saleId: string;
  pointOfSale: number;
  number: number;
  cause: "no_connectivity" | "unclear_outcome" | "numbering_conflict";
}

export function insertOfflineFiscalDocument(
  database: LocalDatabase,
  {
    id = "offline-doc-1",
    saleId = "sale-1",
    pointOfSale = OFFLINE_POINT_OF_SALE,
    number = 1,
    cause = "no_connectivity",
  }: Partial<OfflineFiscalDocumentRow> = {},
): void {
  database
    .prepare(
      `INSERT INTO offline_fiscal_documents (
         id, sale_id, point_of_sale, document_type, number, issued_on, generated_at, generation_stamp,
         offline_authorization_code, fortnight_start, fortnight_end, document,
         buyer_document_type, buyer_document_number, cause
       ) VALUES (
         @id, @sale_id, @point_of_sale, 'factura_c', @number, '2026-09-30',
         '2026-09-30T12:05:00.000Z', '20260930090500', @code, '2026-09-16', '2026-09-30', @document,
         99, 0, @cause
       )`,
    )
    .run({
      id,
      sale_id: saleId,
      point_of_sale: pointOfSale,
      number,
      code: OFFLINE_CODE,
      document: JSON.stringify(FACTURA_C),
      cause,
    });
}

export const SALE_COMPLETED_AT = new Date("2026-09-30T12:05:00.000Z");

export function deferredSaleOf(overrides: Partial<DeferredSale> = {}): DeferredSale {
  return {
    id: "deferred-1",
    saleId: "sale-1",
    occurredAt: SALE_COMPLETED_AT,
    total: FACTURA_C.total,
    reason: "unclear_outcome",
    shortCode: "7KQ4M2P9",
    routedAt: new Date("2026-09-30T12:05:01.000Z"),
    ...overrides,
  };
}

let issuedShortCodes = 0;

export function uniqueShortCode(): string {
  issuedShortCodes += 1;
  return [...issuedShortCodes.toString(8)]
    .map((digit) => String(Number(digit) + 2))
    .join("")
    .padStart(8, "2");
}

export function insertDeferredSale(
  database: LocalDatabase,
  saleId: string,
  reason: DeferralReason = "unclear_outcome",
): DeferredSaleReference {
  const shortCode = uniqueShortCode();
  const id = `deferred-of-${saleId}`;
  database
    .prepare(
      `INSERT INTO deferred_sales (id, sale_id, occurred_at, total, reason, short_code, routed_at)
       VALUES (?, ?, ?, ?, ?, ?, '2026-09-30T12:05:01.000Z')`,
    )
    .run(id, saleId, SALE_COMPLETED_AT.toISOString(), FACTURA_C.total, reason, shortCode);
  return { id, shortCode };
}
