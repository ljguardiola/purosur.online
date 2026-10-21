import type {
  SupplierPriceListReadFailure,
  SupplierPriceListSourceKind,
  SupplierPriceListState,
} from "@purosur/domain";
import type {
  SupplierPriceListListing,
  SupplierPriceListReader,
  SupplierPriceListReview,
} from "@purosur/domain/purchasing/use-cases";
import { asc, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { supplierPriceListRows, supplierPriceLists, suppliers } from "../platform/db/schema.js";

const rowCount = sql<number>`(select count(*)::int from ${supplierPriceListRows} where ${supplierPriceListRows.listId} = ${supplierPriceLists.id})`;
const unpricedRowCount = sql<number>`(select count(*)::int from ${supplierPriceListRows} where ${supplierPriceListRows.listId} = ${supplierPriceLists.id} and ${supplierPriceListRows.priceCents} is null)`;

const listingColumns = {
  id: supplierPriceLists.id,
  supplierId: suppliers.id,
  supplierName: suppliers.name,
  sourceKind: supplierPriceLists.sourceKind,
  fileName: supplierPriceLists.fileName,
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
  sourceKind: string;
  fileName: string;
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
    sourceKind: row.sourceKind as SupplierPriceListSourceKind,
    fileName: row.fileName,
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
      })
      .from(supplierPriceListRows)
      .where(eq(supplierPriceListRows.listId, listId))
      .orderBy(asc(supplierPriceListRows.position));
    return {
      list: {
        ...toListing(list),
        version: list.version,
        pricesIncludeVat: list.pricesIncludeVat,
      },
      rows,
    };
  }

  async fileName(listId: string): Promise<string | undefined> {
    const [list] = await this.db
      .select({ fileName: supplierPriceLists.fileName })
      .from(supplierPriceLists)
      .where(eq(supplierPriceLists.id, listId));
    return list?.fileName;
  }
}
