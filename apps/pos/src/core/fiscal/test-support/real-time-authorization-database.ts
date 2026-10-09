import type { FacturaC } from "@purosur/domain";
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
): void {
  database
    .prepare(
      `INSERT INTO register_point_of_sale (
         register_id, point_of_sale_number, fiscal_address_id, tax_authority_last_authorized_number, version
       ) VALUES ('register-1', ?, 'address-1', ?, 1)`,
    )
    .run(pointOfSale, taxAuthorityLastAuthorized);
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
  state: "REQUESTING" | "AUTHORIZED" | "REJECTED" | "UNKNOWN";
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
         @id, @sale_id, @point_of_sale, 'FACTURA_C', @number, '2026-09-30', @document, @state,
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
