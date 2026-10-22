import type { ReplenishedEventApplication, SyncedFact } from "@purosur/domain/sync/use-cases";
import type { LocalDatabase } from "../platform/local-database";
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
