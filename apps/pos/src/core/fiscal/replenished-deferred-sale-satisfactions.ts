import type { ReplenishedEventApplication, SyncedFact } from "@purosur/domain/sync/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { holdReplenishedAuthorizedDocument } from "./replenished-authorized-documents";
import { holdsDeferredSaleRecord } from "./replenished-deferred-sales";

type SatisfactionFact = Extract<SyncedFact, { kind: "deferred_sale_satisfied" }>;

export function applyReplenishedDeferredSaleSatisfaction(
  database: LocalDatabase,
  { satisfaction }: SatisfactionFact,
): ReplenishedEventApplication {
  if (!holdsDeferredSaleRecord(database, satisfaction.saleId)) {
    return "not_yet_applicable";
  }
  holdReplenishedAuthorizedDocument(database, {
    id: satisfaction.fiscalDocumentId,
    saleId: satisfaction.saleId,
    pointOfSale: satisfaction.pointOfSale,
    number: satisfaction.number,
    issuedOn: satisfaction.issuedOn,
    document: satisfaction.document,
    authorizationCode: satisfaction.authorizationCode,
    authorizationCodeDueOn: satisfaction.authorizationCodeDueOn,
    reservedAt: satisfaction.reservedAt,
    resolvedAt: satisfaction.satisfiedAt,
  });
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
