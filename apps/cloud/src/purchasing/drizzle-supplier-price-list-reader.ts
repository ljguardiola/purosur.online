import {
  type SaleUnit,
  type SupplierPriceListReadFailure,
  type SupplierPriceListState,
  supplierItemKey,
} from "@purosur/domain";
import type {
  SupplierPriceListListing,
  SupplierPriceListReader,
  SupplierPriceListReview,
} from "@purosur/domain/purchasing/use-cases";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  productPackagings,
  products,
  supplierItemPrices,
  supplierItems,
  supplierPriceListRows,
  supplierPriceLists,
  suppliers,
} from "../platform/db/schema.js";

const rowCount = sql<number>`(select count(*)::int from ${supplierPriceListRows} where ${supplierPriceListRows.listId} = ${supplierPriceLists.id})`;
const unpricedRowCount = sql<number>`(select count(*)::int from ${supplierPriceListRows} where ${supplierPriceListRows.listId} = ${supplierPriceLists.id} and ${supplierPriceListRows.priceCents} is null)`;

const listingColumns = {
  id: supplierPriceLists.id,
  supplierId: suppliers.id,
  supplierName: suppliers.name,
  fileName: supplierPriceLists.fileName,
  sourceUrl: supplierPriceLists.sourceUrl,
  listDate: supplierPriceLists.listDate,
  rowCount,
  unpricedRowCount,
  state: supplierPriceLists.state,
  readFailure: supplierPriceLists.readFailure,
  uploadedAt: supplierPriceLists.uploadedAt,
  confirmedAt: supplierPriceLists.confirmedAt,
};

function toListing(row: {
  id: string;
  supplierId: string;
  supplierName: string;
  fileName: string | null;
  sourceUrl: string | null;
  listDate: string | null;
  rowCount: number;
  unpricedRowCount: number;
  state: string;
  readFailure: string | null;
  uploadedAt: Date;
  confirmedAt: Date | null;
}): SupplierPriceListListing {
  return {
    id: row.id,
    supplier: { id: row.supplierId, name: row.supplierName },
    source:
      row.sourceUrl === null
        ? { kind: "PDF", fileName: row.fileName as string }
        : { kind: "WEB_PAGE", url: row.sourceUrl },
    listDate: row.listDate,
    rowCount: row.rowCount,
    unpricedRowCount: row.unpricedRowCount,
    state: row.state as SupplierPriceListState,
    readFailure: row.readFailure as SupplierPriceListReadFailure | null,
    uploadedAt: row.uploadedAt,
    confirmedAt: row.confirmedAt,
  };
}

export class DrizzleSupplierPriceListReader<TQueryResult extends PgQueryResultHKT>
  implements SupplierPriceListReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async lists(): Promise<SupplierPriceListListing[]> {
    const rows = await this.db
      .select(listingColumns)
      .from(supplierPriceLists)
      .innerJoin(suppliers, eq(suppliers.id, supplierPriceLists.supplierId))
      .orderBy(desc(supplierPriceLists.uploadedAt), asc(supplierPriceLists.id));
    return rows.map(toListing);
  }

  async review(listId: string): Promise<SupplierPriceListReview | undefined> {
    const [list] = await this.db
      .select({
        ...listingColumns,
        version: supplierPriceLists.version,
        pricesIncludeVat: supplierPriceLists.pricesIncludeVat,
      })
      .from(supplierPriceLists)
      .innerJoin(suppliers, eq(suppliers.id, supplierPriceLists.supplierId))
      .where(eq(supplierPriceLists.id, listId));
    if (!list) {
      return undefined;
    }
    const rows = await this.db
      .select({
        id: supplierPriceListRows.id,
        description: supplierPriceListRows.description,
        code: supplierPriceListRows.supplierCode,
        presentation: supplierPriceListRows.presentation,
        priceCents: supplierPriceListRows.priceCents,
        page: supplierPriceListRows.page,
        barcode: supplierPriceListRows.barcode,
        reviewed: supplierPriceListRows.reviewed,
        productId: products.id,
        productName: products.name,
        productSaleUnit: products.saleUnit,
        packagingId: productPackagings.id,
        packagingName: productPackagings.name,
        quantityPerPackage: productPackagings.quantityPerPackage,
        vatRate: supplierPriceListRows.vatRate,
      })
      .from(supplierPriceListRows)
      .leftJoin(products, eq(products.id, supplierPriceListRows.productId))
      .leftJoin(productPackagings, eq(productPackagings.id, supplierPriceListRows.packagingId))
      .where(eq(supplierPriceListRows.listId, listId))
      .orderBy(asc(supplierPriceListRows.position));
    const earlier = await this.earlierEntries(list.supplierId, listId, rows);
    return {
      list: {
        ...toListing(list),
        version: list.version,
        pricesIncludeVat: list.pricesIncludeVat,
      },
      rows: rows.map((row) => {
        const key = supplierItemKey(row);
        return {
          id: row.id,
          description: row.description,
          code: row.code,
          presentation: row.presentation,
          priceCents: row.priceCents,
          page: row.page,
          barcode: row.barcode,
          link:
            row.productId !== null && row.packagingId !== null
              ? {
                  product: {
                    id: row.productId,
                    name: row.productName as string,
                    saleUnit: row.productSaleUnit as SaleUnit,
                  },
                  packaging: {
                    id: row.packagingId,
                    name: row.packagingName as string,
                    quantityPerPackage: row.quantityPerPackage as number,
                  },
                  vatRate: row.vatRate,
                }
              : null,
          reviewed: row.reviewed,
          earlier:
            earlier.find((entry) => entry.key.kind === key.kind && entry.key.value === key.value)
              ?.latest ?? null,
        };
      }),
    };
  }

  // The latest price each matching item recorded in a list other than this one, by list date and,
  // on a tie, by the instant its list was confirmed.
  private async earlierEntries(
    supplierId: string,
    listId: string,
    rows: { code: string | null; description: string }[],
  ) {
    const keys = rows.map(supplierItemKey);
    if (keys.length === 0) {
      return [];
    }
    const entries = await this.db
      .selectDistinctOn([supplierItemPrices.itemId], {
        keyKind: supplierItems.keyKind,
        keyValue: supplierItems.keyValue,
        description: supplierItems.description,
        priceCents: supplierItemPrices.priceCents,
      })
      .from(supplierItemPrices)
      .innerJoin(supplierItems, eq(supplierItems.id, supplierItemPrices.itemId))
      .where(
        and(
          eq(supplierItems.supplierId, supplierId),
          inArray(supplierItems.keyValue, [...new Set(keys.map((key) => key.value))]),
          ne(supplierItemPrices.listId, listId),
        ),
      )
      .orderBy(
        supplierItemPrices.itemId,
        desc(supplierItemPrices.listDate),
        desc(supplierItemPrices.confirmedAt),
      );
    return entries.map((entry) => ({
      key: { kind: entry.keyKind as "code" | "description", value: entry.keyValue },
      latest: { description: entry.description, priceCents: entry.priceCents },
    }));
  }

  async fileName(listId: string): Promise<string | undefined> {
    const [list] = await this.db
      .select({ fileName: supplierPriceLists.fileName })
      .from(supplierPriceLists)
      .where(eq(supplierPriceLists.id, listId));
    return list?.fileName ?? undefined;
  }
}
