import type { RebuiltUnclearDeferral } from "@purosur/domain";
import type { ReplenishedEventApplication, SyncedFact } from "@purosur/domain/sync/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { holdReplenishedAuthorizedDocument } from "./replenished-authorized-documents";
import { insertDeferredSale } from "./sqlite-deferred-sales";

type DeferredSaleFact = Extract<SyncedFact, { kind: "deferred_sale_recorded" }>;

export function holdsDeferredSaleRecord(database: LocalDatabase, saleId: string): boolean {
  return (
    database.prepare("SELECT 1 FROM deferred_sales WHERE sale_id = ?").get(saleId) !== undefined
  );
}

export function applyReplenishedDeferredSale(
  database: LocalDatabase,
  { deferredSale }: DeferredSaleFact,
): ReplenishedEventApplication {
  if (holdsDeferredSaleRecord(database, deferredSale.saleId)) {
    return "applied";
  }
  const sale = database.prepare("SELECT 1 FROM sales WHERE id = ?").get(deferredSale.saleId);
  if (sale === undefined) {
    return "not_yet_applicable";
  }
  insertDeferredSale(database, deferredSale);
  return "applied";
}

export function rebuildReplenishedUnclearDeferredSale(
  database: LocalDatabase,
  { deferredSale, authorizedDocument }: RebuiltUnclearDeferral,
): ReplenishedEventApplication {
  if (holdsDeferredSaleRecord(database, deferredSale.saleId)) {
    return "applied";
  }
  const sale = database.prepare("SELECT 1 FROM sales WHERE id = ?").get(deferredSale.saleId);
  if (sale === undefined) {
    return "not_yet_applicable";
  }
  insertDeferredSale(database, deferredSale);
  if (authorizedDocument !== null) {
    holdReplenishedAuthorizedDocument(database, {
      ...authorizedDocument,
      resolvedAt: authorizedDocument.satisfiedAt,
    });
    database
      .prepare(
        `UPDATE deferred_sales
         SET satisfied_by_fiscal_document_id = @document_id, satisfied_at = @satisfied_at
         WHERE sale_id = @sale_id`,
      )
      .run({
        document_id: authorizedDocument.id,
        satisfied_at: authorizedDocument.satisfiedAt.toISOString(),
        sale_id: deferredSale.saleId,
      });
  }
  return "applied";
}
