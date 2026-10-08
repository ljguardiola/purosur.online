import {
  type FiscalDocumentState,
  type FiscalOnlineSignalEvidence,
  NUMBER_CONSUMING_STATES,
  SERIES_WAITING_STATES,
} from "@purosur/domain";
import {
  decideSaleAuthorization,
  type FiscalDocumentReservation,
  type RealTimeSeries,
  type SaleAuthorizationTransaction,
  type SaleRoutedToDeferred,
} from "@purosur/domain/fiscal/use-cases";
import type { SaleAuthorizationDecision } from "@purosur/domain/sales/use-cases";
import type { LocalDatabase } from "../platform/local-database";

const FACTURA_C = "FACTURA_C";

function placeholdersFor(states: readonly FiscalDocumentState[]): string {
  return states.map(() => "?").join(", ");
}

interface HealthCheckRow {
  checked_at: string;
  token_valid: number;
  arca_reachable: number;
}

interface PointOfSaleRow {
  point_of_sale: number;
  tax_authority_count: number | null;
}

function sqliteSaleAuthorizationTransaction(database: LocalDatabase): SaleAuthorizationTransaction {
  return {
    fiscalOnlineEvidence(): FiscalOnlineSignalEvidence {
      const latest = database
        .prepare<[], HealthCheckRow>(
          `SELECT checked_at, token_valid, arca_reachable
           FROM register_health_checks ORDER BY id DESC LIMIT 1`,
        )
        .get();
      return latest === undefined
        ? { lastHealthCheckOkAt: null, tokenValid: false, arcaReachable: false }
        : {
            lastHealthCheckOkAt: new Date(latest.checked_at),
            tokenValid: latest.token_valid === 1,
            arcaReachable: latest.arca_reachable === 1,
          };
    },

    realTimeSeries(): RealTimeSeries {
      const pointOfSale = database
        .prepare<[], PointOfSaleRow>(
          `SELECT register_point_of_sale.point_of_sale_number AS point_of_sale,
                  register_point_of_sale.tax_authority_last_authorized_number AS tax_authority_count
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
          documentWaiting: false,
        };
      }
      const local = database
        .prepare<(number | string)[], { last_authorized: number | null }>(
          `SELECT max(number) AS last_authorized FROM fiscal_documents
           WHERE point_of_sale = ? AND document_type = ?
             AND state IN (${placeholdersFor(NUMBER_CONSUMING_STATES)})`,
        )
        .get(pointOfSale.point_of_sale, FACTURA_C, ...NUMBER_CONSUMING_STATES);
      const waiting = database
        .prepare<(number | string)[], { waiting: 1 }>(
          `SELECT 1 AS waiting FROM fiscal_documents
           WHERE point_of_sale = ? AND document_type = ?
             AND state IN (${placeholdersFor(SERIES_WAITING_STATES)})`,
        )
        .get(pointOfSale.point_of_sale, FACTURA_C, ...SERIES_WAITING_STATES);
      return {
        pointOfSale: pointOfSale.point_of_sale,
        localLastAuthorized: local?.last_authorized ?? null,
        taxAuthorityLastAuthorized: pointOfSale.tax_authority_count,
        documentWaiting: waiting !== undefined,
      };
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
          document_type: FACTURA_C,
          number: reservation.number,
          issued_on: reservation.issuedOn,
          document: JSON.stringify(reservation.document),
          reserved_at: reservation.reservedAt.toISOString(),
        });
    },

    routeSaleToDeferred(routing: SaleRoutedToDeferred): void {
      database
        .prepare(
          "INSERT INTO deferred_sales (sale_id, reason, routed_at) VALUES (@sale_id, @reason, @routed_at)",
        )
        .run({
          sale_id: routing.saleId,
          reason: routing.reason,
          routed_at: routing.routedAt.toISOString(),
        });
    },
  };
}

export function decideSaleAuthorizationIn(
  database: LocalDatabase,
  { ids, saleId, gate, decidedAt }: SaleAuthorizationDecision,
): void {
  decideSaleAuthorization(sqliteSaleAuthorizationTransaction(database), ids, {
    saleId,
    gate,
    decidedAt,
  });
}
