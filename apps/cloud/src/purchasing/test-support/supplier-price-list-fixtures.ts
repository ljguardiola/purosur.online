import type {
  SupplierPriceListContentKind,
  SupplierPriceListReadFailure,
  SupplierPriceListState,
} from "@purosur/domain";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  supplierItemPrices,
  supplierItems,
  supplierPriceListRows,
  supplierPriceLists,
  suppliers,
} from "../../platform/db/schema.js";

export async function insertSupplier<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: { actorId: string; name?: string; active?: boolean },
): Promise<string> {
  const [supplier] = await db
    .insert(suppliers)
    .values({
      name: input.name ?? `Distribuidora ${crypto.randomUUID()}`,
      active: input.active ?? true,
      actorId: input.actorId,
    })
    .returning({ id: suppliers.id });
  if (!supplier) {
    throw new Error("test setup: seeding the supplier returned no row");
  }
  return supplier.id;
}

export interface PriceListSeed {
  supplierId: string;
  locationId: string;
  actorId: string;
  state?: SupplierPriceListState;
  readFailure?: SupplierPriceListReadFailure | null;
  fileName?: string;
  sourceUrl?: string;
  contentKind?: SupplierPriceListContentKind;
  uploadedAt?: Date;
  sentAt?: Date | null;
  sentOn?: string | null;
  listDate?: string | null;
  pricesIncludeVat?: boolean | null;
  confirmedAt?: Date | null;
  version?: number;
}

export async function insertPriceList<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  seed: PriceListSeed,
): Promise<string> {
  const [list] = await db
    .insert(supplierPriceLists)
    .values({
      supplierId: seed.supplierId,
      locationId: seed.locationId,
      ...(seed.sourceUrl === undefined
        ? { sourceKind: "PDF", fileName: seed.fileName ?? "lista.pdf", sourceUrl: null }
        : { sourceKind: "WEB_PAGE", fileName: null, sourceUrl: seed.sourceUrl }),
      fileContentKind: seed.contentKind ?? (seed.sourceUrl === undefined ? "PDF" : "HTML"),
      fileByteSize: 1_000,
      state: seed.state ?? "READING",
      readFailure: seed.readFailure ?? null,
      uploadedAt: seed.uploadedAt ?? new Date("2026-03-01T12:00:00.000Z"),
      uploadedBy: seed.actorId,
      sentAt: seed.sentAt ?? null,
      sentOn: seed.sentOn ?? null,
      listDate: seed.listDate ?? null,
      pricesIncludeVat: seed.pricesIncludeVat ?? null,
      confirmedAt: seed.confirmedAt ?? null,
      version: seed.version ?? 1,
    })
    .returning({ id: supplierPriceLists.id });
  if (!list) {
    throw new Error("test setup: seeding the price list returned no row");
  }
  return list.id;
}

// A statement carries at most 32,767 parameters in the lightweight test database.
const ROWS_PER_INSERT = 1_000;

export interface PriceListRowSeed {
  description?: string;
  code?: string | null;
  presentation?: string | null;
  priceCents?: number | null;
  page?: number | null;
  barcode?: string | null;
  productId?: string | null;
  packagingId?: string | null;
  vatRate?: number | null;
  reviewed?: boolean;
  linkedByPerson?: boolean;
}

export async function insertPriceListRows<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  listId: string,
  rows: PriceListRowSeed[],
): Promise<string[]> {
  const inserted: { id: string; position: number }[] = [];
  for (let start = 0; start < rows.length; start += ROWS_PER_INSERT) {
    const chunk = await db
      .insert(supplierPriceListRows)
      .values(
        rows.slice(start, start + ROWS_PER_INSERT).map((row, offset) => ({
          listId,
          position: start + offset,
          description: row.description ?? `Producto ${start + offset}`,
          supplierCode: row.code ?? null,
          presentation: row.presentation ?? null,
          priceCents: row.priceCents === undefined ? 100 : row.priceCents,
          page: row.page ?? null,
          barcode: row.barcode ?? null,
          productId: row.productId ?? null,
          packagingId: row.packagingId ?? null,
          vatRate: row.vatRate ?? null,
          reviewed: row.reviewed ?? false,
          linkedByPerson: row.linkedByPerson ?? false,
        })),
      )
      .returning({ id: supplierPriceListRows.id, position: supplierPriceListRows.position });
    inserted.push(...chunk);
  }
  return inserted.sort((first, second) => first.position - second.position).map(({ id }) => id);
}

export interface SupplierItemSeed {
  supplierId: string;
  keyKind?: "code" | "description";
  keyValue?: string;
  description?: string;
  productId?: string | null;
  packagingId?: string | null;
  vatRate?: number | null;
}

export async function insertSupplierItem<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  seed: SupplierItemSeed,
): Promise<string> {
  const [item] = await db
    .insert(supplierItems)
    .values({
      supplierId: seed.supplierId,
      keyKind: seed.keyKind ?? "code",
      keyValue: seed.keyValue ?? `C-${crypto.randomUUID()}`,
      description: seed.description ?? "Yerba 1 kg",
      productId: seed.productId ?? null,
      packagingId: seed.packagingId ?? null,
      vatRate: seed.vatRate ?? null,
    })
    .returning({ id: supplierItems.id });
  if (!item) {
    throw new Error("test setup: seeding the supplier item returned no row");
  }
  return item.id;
}

export interface SupplierItemPriceSeed {
  itemId: string;
  listId: string;
  priceCents?: number;
  listDate?: string;
  pricesIncludeVat?: boolean;
  confirmedAt?: Date;
}

export async function insertSupplierItemPrice<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  seed: SupplierItemPriceSeed,
): Promise<void> {
  await db.insert(supplierItemPrices).values({
    itemId: seed.itemId,
    listId: seed.listId,
    priceCents: seed.priceCents ?? 1_500,
    listDate: seed.listDate ?? "2026-03-01",
    pricesIncludeVat: seed.pricesIncludeVat ?? false,
    confirmedAt: seed.confirmedAt ?? new Date("2026-03-02T12:00:00.000Z"),
  });
}
