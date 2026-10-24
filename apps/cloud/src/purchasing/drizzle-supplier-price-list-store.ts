import {
  countsTowardDailyExtractionCap,
  DEFAULT_SUPPLIER_PRICE_LIST_DAILY_EXTRACTION_CAP,
  type SaleUnit,
  type SupplierItemKey,
  type SupplierPriceListContentKind,
  type SupplierPriceListReadFailure,
  type SupplierPriceListSourceKind,
  type SupplierPriceListState,
} from "@purosur/domain";
import type {
  FindPriceListSupplierResult,
  FindSupplierPriceListSourceResult,
  LockProductPackagingResult,
  LockSupplierPriceListResult,
  LockSupplierPriceListRowResult,
  NewSupplierItemFields,
  NewSupplierPriceListFields,
  ProposedPriceListRow,
  StoredPriceListRow,
  SupplierItem,
  SupplierItemLink,
  SupplierItemPriceEntry,
  SupplierPriceListStore,
  SupplierPriceListStoreTransaction,
} from "@purosur/domain/purchasing/use-cases";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  auditLog,
  locations,
  productPackagings,
  products,
  supplierItemPrices,
  supplierItems,
  supplierPriceListExtractionCaps,
  supplierPriceListRows,
  supplierPriceLists,
  suppliers,
} from "../platform/db/schema.js";
import {
  SUPPLIER_PRICE_LIST_READING_MAX_ATTEMPTS,
  SUPPLIER_PRICE_LIST_READING_TASK_IDENTIFIER,
} from "./supplier-price-list-reading-task-identifier.js";

const ROW_AUDIT_ENTITY = "supplier_price_list_row";

const ROWS_PER_STATEMENT = 1_000;

function batchesOf<T>(rows: T[]): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < rows.length; start += ROWS_PER_STATEMENT) {
    batches.push(rows.slice(start, start + ROWS_PER_STATEMENT));
  }
  return batches;
}

function linkColumns(link: SupplierItemLink | null) {
  return {
    productId: link?.productId ?? null,
    packagingId: link?.packagingId ?? null,
    vatRate: link?.vatRate ?? null,
  };
}

function linkOf(columns: {
  productId: string | null;
  packagingId: string | null;
  vatRate: number | null;
}): SupplierItemLink | null {
  return columns.productId === null || columns.packagingId === null
    ? null
    : { productId: columns.productId, packagingId: columns.packagingId, vatRate: columns.vatRate };
}

class DrizzleSupplierPriceListStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements SupplierPriceListStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;
  private readonly now: () => Date;
  // A list can hold thousands of items, so what is written per item is sent in batches before it
  // is read back, before the list is confirmed and before the transaction ends.
  private readonly newItems: (typeof supplierItems.$inferInsert)[] = [];
  private readonly describedItems = new Map<string, string>();
  private readonly linkedItems = new Map<string, SupplierItemLink>();
  private readonly itemPrices: (typeof supplierItemPrices.$inferInsert)[] = [];

  constructor(tx: PgDatabase<TQueryResult>, now: () => Date) {
    this.tx = tx;
    this.now = now;
  }

  async lockBranchExtractionQuota(locationId: string): Promise<{ cap: number }> {
    await this.tx
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.id, locationId))
      .for("no key update");
    const [setCap] = await this.tx
      .select({ dailyCap: supplierPriceListExtractionCaps.dailyCap })
      .from(supplierPriceListExtractionCaps)
      .where(eq(supplierPriceListExtractionCaps.locationId, locationId));
    return { cap: setCap?.dailyCap ?? DEFAULT_SUPPLIER_PRICE_LIST_DAILY_EXTRACTION_CAP };
  }

  async extractionsCountedOn(locationId: string, day: string): Promise<number> {
    const lists = await this.tx
      .select({ state: supplierPriceLists.state, sentOn: supplierPriceLists.sentOn })
      .from(supplierPriceLists)
      .where(eq(supplierPriceLists.locationId, locationId));
    return lists.filter((list) =>
      countsTowardDailyExtractionCap(
        { state: list.state as SupplierPriceListState, sentOn: list.sentOn },
        day,
      ),
    ).length;
  }

  async findSupplier(supplierId: string): Promise<FindPriceListSupplierResult> {
    const [supplier] = await this.tx
      .select({ id: suppliers.id, active: suppliers.active })
      .from(suppliers)
      .where(eq(suppliers.id, supplierId));
    return supplier ? { kind: "found", supplier } : { kind: "not_found" };
  }

  async findListSource(listId: string): Promise<FindSupplierPriceListSourceResult> {
    const [list] = await this.tx
      .select({
        supplierId: supplierPriceLists.supplierId,
        sourceUrl: supplierPriceLists.sourceUrl,
      })
      .from(supplierPriceLists)
      .where(eq(supplierPriceLists.id, listId));
    if (!list) {
      return { kind: "not_found" };
    }
    return {
      kind: "found",
      supplierId: list.supplierId,
      source: list.sourceUrl === null ? { kind: "PDF" } : { kind: "WEB_PAGE", url: list.sourceUrl },
    };
  }

  async insertList(fields: NewSupplierPriceListFields): Promise<{ id: string }> {
    const [list] = await this.tx
      .insert(supplierPriceLists)
      .values({
        supplierId: fields.supplierId,
        locationId: fields.locationId,
        sourceKind: fields.sourceKind,
        ...(fields.sourceKind === "PDF"
          ? { fileName: fields.fileName, sourceUrl: null }
          : { fileName: null, sourceUrl: fields.sourceUrl }),
        fileContentKind: fields.contentKind,
        fileByteSize: fields.byteSize,
        state: "READING",
        uploadedAt: fields.uploadedAt,
        uploadedBy: fields.actorId,
      })
      .returning({ id: supplierPriceLists.id });
    if (!list) {
      throw new Error("inserting the supplier price list returned no row");
    }
    return list;
  }

  // graphile-worker's JavaScript `addJob` runs on its own pool, so it cannot join this
  // transaction; its SQL function can.
  async enqueueReading(listId: string): Promise<void> {
    await this.tx.execute(
      sql`select graphile_worker.add_job(
        ${SUPPLIER_PRICE_LIST_READING_TASK_IDENTIFIER}::text,
        json_build_object('listId', ${listId}::text),
        job_key => ${listId}::text,
        max_attempts => ${SUPPLIER_PRICE_LIST_READING_MAX_ATTEMPTS}::int
      )`,
    );
  }

  async lockList(listId: string): Promise<LockSupplierPriceListResult> {
    const [list] = await this.tx
      .select()
      .from(supplierPriceLists)
      .where(eq(supplierPriceLists.id, listId))
      .for("update");
    if (!list) {
      return { kind: "not_found" };
    }
    const rows = await this.tx
      .select({ priceCents: supplierPriceListRows.priceCents })
      .from(supplierPriceListRows)
      .where(eq(supplierPriceListRows.listId, listId))
      .orderBy(asc(supplierPriceListRows.position));
    return {
      kind: "locked",
      list: {
        id: list.id,
        supplierId: list.supplierId,
        sourceKind: list.sourceKind as SupplierPriceListSourceKind,
        contentKind: list.fileContentKind as SupplierPriceListContentKind,
        state: list.state as SupplierPriceListState,
        version: list.version,
        listDate: list.listDate,
        pricesIncludeVat: list.pricesIncludeVat,
        sentAt: list.sentAt,
        rowPrices: rows.map((row) => row.priceCents),
      },
    };
  }

  async markSent(listId: string, sentAt: Date, sentOn: string): Promise<void> {
    await this.tx
      .update(supplierPriceLists)
      .set({ sentAt, sentOn })
      .where(eq(supplierPriceLists.id, listId));
  }

  async recordExtraction(
    listId: string,
    listDate: string | null,
    pricesIncludeVat: boolean | null,
    rows: ProposedPriceListRow[],
  ): Promise<void> {
    const positioned = rows.map((row, position) => ({
      listId,
      position,
      description: row.description,
      supplierCode: row.code,
      presentation: row.presentation,
      priceCents: row.priceCents,
      page: row.page,
      barcode: row.barcode,
      ...linkColumns(row.link),
    }));
    for (const batch of batchesOf(positioned)) {
      await this.tx.insert(supplierPriceListRows).values(batch);
    }
    await this.tx
      .update(supplierPriceLists)
      .set({
        state: "EXTRACTED",
        listDate,
        pricesIncludeVat,
        extractedAt: this.now(),
        version: sql`${supplierPriceLists.version} + 1`,
      })
      .where(eq(supplierPriceLists.id, listId));
  }

  async recordReadFailure(listId: string, reason: SupplierPriceListReadFailure): Promise<void> {
    await this.tx
      .update(supplierPriceLists)
      .set({
        state: "READ_FAILED",
        readFailure: reason,
        version: sql`${supplierPriceLists.version} + 1`,
      })
      .where(eq(supplierPriceLists.id, listId));
  }

  async lockRow(listId: string, rowId: string): Promise<LockSupplierPriceListRowResult> {
    const [row] = await this.tx
      .select({
        description: supplierPriceListRows.description,
        code: supplierPriceListRows.supplierCode,
      })
      .from(supplierPriceListRows)
      .where(and(eq(supplierPriceListRows.id, rowId), eq(supplierPriceListRows.listId, listId)))
      .for("update");
    return row ? { kind: "locked", row } : { kind: "not_found" };
  }

  async listRows(listId: string): Promise<StoredPriceListRow[]> {
    const rows = await this.tx
      .select({
        id: supplierPriceListRows.id,
        description: supplierPriceListRows.description,
        code: supplierPriceListRows.supplierCode,
        priceCents: supplierPriceListRows.priceCents,
        productId: supplierPriceListRows.productId,
        packagingId: supplierPriceListRows.packagingId,
        vatRate: supplierPriceListRows.vatRate,
      })
      .from(supplierPriceListRows)
      .where(eq(supplierPriceListRows.listId, listId))
      .orderBy(asc(supplierPriceListRows.position));
    return rows.map(({ productId, packagingId, vatRate, ...row }) => ({
      ...row,
      link: linkOf({ productId, packagingId, vatRate }),
    }));
  }

  async supplierItems(supplierId: string, keys: SupplierItemKey[]): Promise<SupplierItem[]> {
    if (keys.length === 0) {
      return [];
    }
    await this.flushItems();
    const items = await this.tx
      .select({
        id: supplierItems.id,
        keyKind: supplierItems.keyKind,
        keyValue: supplierItems.keyValue,
        description: supplierItems.description,
        productId: supplierItems.productId,
        packagingId: supplierItems.packagingId,
        vatRate: supplierItems.vatRate,
        currentListDate: sql<
          string | null
        >`(select max(${supplierItemPrices.listDate})::text from ${supplierItemPrices} where ${supplierItemPrices.itemId} = ${supplierItems.id})`,
      })
      .from(supplierItems)
      .where(
        and(
          eq(supplierItems.supplierId, supplierId),
          inArray(supplierItems.keyValue, [...new Set(keys.map((key) => key.value))]),
        ),
      );
    return items
      .filter((item) =>
        keys.some((key) => key.kind === item.keyKind && key.value === item.keyValue),
      )
      .map((item) => ({
        id: item.id,
        key: { kind: item.keyKind as SupplierItemKey["kind"], value: item.keyValue },
        description: item.description,
        link: linkOf(item),
        currentListDate: item.currentListDate,
      }));
  }

  async lockSupplierItems(supplierId: string, keys: SupplierItemKey[]): Promise<SupplierItem[]> {
    await this.tx
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(eq(suppliers.id, supplierId))
      .for("no key update");
    return this.supplierItems(supplierId, keys);
  }

  async lockProductPackaging(
    productId: string,
    packagingId: string,
  ): Promise<LockProductPackagingResult> {
    const [product] = await this.tx
      .select({ active: products.active, saleUnit: products.saleUnit })
      .from(products)
      .where(eq(products.id, productId))
      .for("share");
    const [packaging] = await this.tx
      .select({
        productId: productPackagings.productId,
        active: productPackagings.active,
        saleUnit: productPackagings.saleUnit,
      })
      .from(productPackagings)
      .where(eq(productPackagings.id, packagingId))
      .for("share");
    return product && packaging
      ? {
          kind: "locked",
          product: { active: product.active, saleUnit: product.saleUnit as SaleUnit },
          packaging: { ...packaging, saleUnit: packaging.saleUnit as SaleUnit },
        }
      : { kind: "not_found" };
  }

  async addSupplierItem(fields: NewSupplierItemFields): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    this.newItems.push({
      id,
      supplierId: fields.supplierId,
      keyKind: fields.key.kind,
      keyValue: fields.key.value,
      description: fields.description,
      ...linkColumns(fields.link),
    });
    return { id };
  }

  async describeSupplierItem(itemId: string, description: string): Promise<void> {
    this.describedItems.set(itemId, description);
  }

  async rememberSupplierItemLink(itemId: string, link: SupplierItemLink): Promise<void> {
    this.linkedItems.set(itemId, link);
  }

  async recordSupplierItemPrice(entry: SupplierItemPriceEntry): Promise<void> {
    this.itemPrices.push({ ...entry, confirmedAt: this.now() });
  }

  async flushItems(): Promise<void> {
    for (const batch of batchesOf(this.newItems.splice(0))) {
      await this.tx.insert(supplierItems).values(batch);
    }
    for (const batch of batchesOf([...this.describedItems])) {
      await this.tx.execute(sql`update ${supplierItems} as item
        set description = described.description
        from (values ${sql.join(
          batch.map(([id, description]) => sql`(${id}::uuid, ${description}::text)`),
          sql`, `,
        )}) as described(id, description)
        where item.id = described.id`);
    }
    this.describedItems.clear();
    for (const batch of batchesOf([...this.linkedItems])) {
      await this.tx.execute(sql`update ${supplierItems} as item
        set product_id = linked.product_id, packaging_id = linked.packaging_id, vat_rate = linked.vat_rate
        from (values ${sql.join(
          batch.map(
            ([id, link]) =>
              sql`(${id}::uuid, ${link.productId}::uuid, ${link.packagingId}::uuid, ${link.vatRate}::integer)`,
          ),
          sql`, `,
        )}) as linked(id, product_id, packaging_id, vat_rate)
        where item.id = linked.id`);
    }
    this.linkedItems.clear();
    for (const batch of batchesOf(this.itemPrices.splice(0))) {
      await this.tx.insert(supplierItemPrices).values(batch);
    }
  }

  async linkRow(
    listId: string,
    rowId: string,
    link: SupplierItemLink,
    actorId: string,
  ): Promise<void> {
    const [previous] = await this.tx
      .select({
        productId: supplierPriceListRows.productId,
        packagingId: supplierPriceListRows.packagingId,
        vatRate: supplierPriceListRows.vatRate,
        reviewed: supplierPriceListRows.reviewed,
      })
      .from(supplierPriceListRows)
      .where(eq(supplierPriceListRows.id, rowId));
    await this.tx
      .update(supplierPriceListRows)
      .set({ ...linkColumns(link), reviewed: true })
      .where(eq(supplierPriceListRows.id, rowId));
    await this.advanceVersion(listId);
    await this.tx.insert(auditLog).values({
      entity: ROW_AUDIT_ENTITY,
      entityId: rowId,
      actorId,
      at: this.now(),
      previousValue: previous ?? null,
      newValue: { ...linkColumns(link), reviewed: true },
    });
  }

  async markRowReviewed(listId: string, rowId: string, actorId: string): Promise<void> {
    await this.tx
      .update(supplierPriceListRows)
      .set({ reviewed: true })
      .where(eq(supplierPriceListRows.id, rowId));
    await this.advanceVersion(listId);
    await this.tx.insert(auditLog).values({
      entity: ROW_AUDIT_ENTITY,
      entityId: rowId,
      actorId,
      at: this.now(),
      previousValue: { reviewed: false },
      newValue: { reviewed: true },
    });
  }

  async setRowPrice(
    listId: string,
    rowId: string,
    priceCents: number,
    actorId: string,
  ): Promise<void> {
    const [previous] = await this.tx
      .select({ priceCents: supplierPriceListRows.priceCents })
      .from(supplierPriceListRows)
      .where(eq(supplierPriceListRows.id, rowId));
    await this.tx
      .update(supplierPriceListRows)
      .set({ priceCents })
      .where(eq(supplierPriceListRows.id, rowId));
    await this.advanceVersion(listId);
    await this.tx.insert(auditLog).values({
      entity: ROW_AUDIT_ENTITY,
      entityId: rowId,
      actorId,
      at: this.now(),
      previousValue: { priceCents: previous?.priceCents ?? null },
      newValue: { priceCents },
    });
  }

  async removeRow(listId: string, rowId: string, actorId: string): Promise<void> {
    const [removed] = await this.tx
      .delete(supplierPriceListRows)
      .where(eq(supplierPriceListRows.id, rowId))
      .returning({
        description: supplierPriceListRows.description,
        code: supplierPriceListRows.supplierCode,
        presentation: supplierPriceListRows.presentation,
        priceCents: supplierPriceListRows.priceCents,
        page: supplierPriceListRows.page,
      });
    await this.advanceVersion(listId);
    await this.tx.insert(auditLog).values({
      entity: ROW_AUDIT_ENTITY,
      entityId: rowId,
      actorId,
      at: this.now(),
      previousValue: removed ?? null,
      newValue: null,
    });
  }

  async confirmList(
    listId: string,
    listDate: string,
    pricesIncludeVat: boolean,
    confirmedAt: Date,
    actorId: string,
  ): Promise<void> {
    await this.flushItems();
    await this.tx
      .update(supplierPriceLists)
      .set({
        state: "REVIEWED",
        listDate,
        pricesIncludeVat,
        confirmedAt,
        confirmedBy: actorId,
        version: sql`${supplierPriceLists.version} + 1`,
      })
      .where(eq(supplierPriceLists.id, listId));
    await this.tx
      .update(supplierItemPrices)
      .set({ confirmedAt })
      .where(eq(supplierItemPrices.listId, listId));
  }

  async discardList(listId: string, discardedAt: Date, actorId: string): Promise<void> {
    await this.tx
      .update(supplierPriceLists)
      .set({
        state: "DISCARDED",
        discardedAt,
        discardedBy: actorId,
        version: sql`${supplierPriceLists.version} + 1`,
      })
      .where(eq(supplierPriceLists.id, listId));
  }

  private async advanceVersion(listId: string): Promise<void> {
    await this.tx
      .update(supplierPriceLists)
      .set({ version: sql`${supplierPriceLists.version} + 1` })
      .where(eq(supplierPriceLists.id, listId));
  }
}

export class DrizzleSupplierPriceListStore<TQueryResult extends PgQueryResultHKT>
  implements SupplierPriceListStore
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  transaction<TOutcome>(
    work: (tx: SupplierPriceListStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction(async (tx) => {
      const transaction = new DrizzleSupplierPriceListStoreTransaction(tx, this.now);
      const outcome = await work(transaction);
      await transaction.flushItems();
      return outcome;
    });
  }
}
