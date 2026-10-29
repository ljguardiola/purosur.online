import type { SupplierItemKey } from "@purosur/domain";
import { createProduct } from "@purosur/domain/catalog/use-cases";
import type {
  CreateCatalogProductInput,
  CreateCatalogProductOutcome,
  LockSupplierItemRowResult,
  NewPackagingFields,
  SupplierItemLink,
  SupplierItemProductStore,
  SupplierItemProductStoreTransaction,
} from "@purosur/domain/purchasing/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { DrizzleCatalogStore } from "../catalog/drizzle-catalog-store.js";
import { supplierPriceListRows } from "../platform/db/schema.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";
import { DrizzlePurchasingStoreTransaction } from "./drizzle-purchasing-store.js";
import {
  DrizzleSupplierPriceListStoreTransaction,
  linkOf,
} from "./drizzle-supplier-price-list-store.js";

class DrizzleSupplierItemProductStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements SupplierItemProductStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;
  private readonly pending: PendingChanges;
  private readonly lists: DrizzleSupplierPriceListStoreTransaction<TQueryResult>;
  private readonly purchasing: DrizzlePurchasingStoreTransaction<TQueryResult>;

  constructor(
    tx: PgDatabase<TQueryResult>,
    lists: DrizzleSupplierPriceListStoreTransaction<TQueryResult>,
    now: () => Date,
    pending: PendingChanges,
  ) {
    this.tx = tx;
    this.pending = pending;
    this.lists = lists;
    this.purchasing = new DrizzlePurchasingStoreTransaction(tx, now, pending);
  }

  lockList(listId: string) {
    return this.lists.lockList(listId);
  }

  linkRow(listId: string, rowId: string, link: SupplierItemLink, actorId: string) {
    return this.lists.linkRow(listId, rowId, link, actorId);
  }

  lockSupplierItems(supplierId: string, keys: SupplierItemKey[]) {
    return this.lists.lockSupplierItems(supplierId, keys);
  }

  rememberSupplierItemLink(itemId: string, link: SupplierItemLink) {
    return this.lists.rememberSupplierItemLink(itemId, link);
  }

  async lockRow(listId: string, rowId: string): Promise<LockSupplierItemRowResult> {
    const [row] = await this.tx
      .select({
        description: supplierPriceListRows.description,
        code: supplierPriceListRows.supplierCode,
        presentation: supplierPriceListRows.presentation,
        productId: supplierPriceListRows.productId,
        packagingId: supplierPriceListRows.packagingId,
        vatRate: supplierPriceListRows.vatRate,
      })
      .from(supplierPriceListRows)
      .where(and(eq(supplierPriceListRows.id, rowId), eq(supplierPriceListRows.listId, listId)))
      .for("update");
    return row
      ? {
          kind: "locked",
          row: {
            description: row.description,
            code: row.code,
            presentation: row.presentation,
            link: linkOf(row),
          },
        }
      : { kind: "not_found" };
  }

  async createCatalogProduct(
    input: CreateCatalogProductInput,
  ): Promise<CreateCatalogProductOutcome> {
    const outcome = await createProduct(new DrizzleCatalogStore(this.tx, this.pending), input);
    return outcome.kind === "created"
      ? { kind: "created", productId: outcome.product.id }
      : outcome;
  }

  insertPackaging(fields: NewPackagingFields) {
    return this.purchasing.insertPackaging(fields);
  }
}

export class DrizzleSupplierItemProductStore<TQueryResult extends PgQueryResultHKT>
  implements SupplierItemProductStore
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  transaction<TOutcome>(
    work: (tx: SupplierItemProductStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPendingChanges(this.db, undefined, async (tx, pending) => {
      const lists = new DrizzleSupplierPriceListStoreTransaction(tx, this.now);
      const outcome = await work(
        new DrizzleSupplierItemProductStoreTransaction(tx, lists, this.now, pending),
      );
      await lists.flushItems();
      return outcome;
    });
  }
}
