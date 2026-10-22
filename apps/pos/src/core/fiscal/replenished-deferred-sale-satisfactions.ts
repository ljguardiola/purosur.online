import { raisedClockMark } from "@purosur/domain";
import type { ReplenishedEventApplication, SyncedFact } from "@purosur/domain/sync/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { holdsDeferredSaleRecord } from "./replenished-deferred-sales";
import { clockMarkOf } from "./sqlite-fiscal-series";
import { upsertClockMark } from "./sqlite-sale-authorization";

type SatisfactionFact = Extract<SyncedFact, { kind: "deferred_sale_satisfied" }>;

const FACTURA_C = "factura_c";

export function applyReplenishedDeferredSaleSatisfaction(
  database: LocalDatabase,
  { satisfaction }: SatisfactionFact,
): ReplenishedEventApplication {
  if (!holdsDeferredSaleRecord(database, satisfaction.saleId)) {
    return "not_yet_applicable";
  }
  if (
    database
      .prepare("SELECT 1 FROM fiscal_documents WHERE id = ?")
      .get(satisfaction.fiscalDocumentId) === undefined
  ) {
    database
      .prepare(
        `INSERT INTO fiscal_documents (
           id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
           authorization_code, authorization_code_due_on, reserved_at, resolved_at
         ) VALUES (
           @id, @sale_id, @point_of_sale, @document_type, @number, @issued_on, @document,
           'AUTHORIZED', @authorization_code, @authorization_code_due_on, @reserved_at, @resolved_at
         )`,
      )
      .run({
        id: satisfaction.fiscalDocumentId,
        sale_id: satisfaction.saleId,
        point_of_sale: satisfaction.pointOfSale,
        document_type: FACTURA_C,
        number: satisfaction.number,
        issued_on: satisfaction.issuedOn,
        document: JSON.stringify(satisfaction.document),
        authorization_code: satisfaction.authorizationCode,
        authorization_code_due_on: satisfaction.authorizationCodeDueOn,
        reserved_at: satisfaction.reservedAt.toISOString(),
        resolved_at: satisfaction.satisfiedAt.toISOString(),
      });
    upsertClockMark(database, {
      pointOfSale: satisfaction.pointOfSale,
      documentType: FACTURA_C,
      reading: raisedClockMark(
        clockMarkOf(database, satisfaction.pointOfSale, FACTURA_C),
        satisfaction.reservedAt,
      ),
    });
  }
  database
    .prepare(
      `UPDATE deferred_sales
       SET satisfied_by_fiscal_document_id = @document_id, satisfied_at = @satisfied_at
       WHERE sale_id = @sale_id AND satisfied_at IS NULL AND cancelled_at IS NULL`,
    )
    .run({
      document_id: satisfaction.fiscalDocumentId,
      satisfied_at: satisfaction.satisfiedAt.toISOString(),
      sale_id: satisfaction.saleId,
    });
  return "applied";
}
