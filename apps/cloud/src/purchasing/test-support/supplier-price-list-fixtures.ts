import type { SupplierPriceListReadFailure, SupplierPriceListState } from "@purosur/domain";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { supplierPriceListRows, supplierPriceLists, suppliers } from "../../platform/db/schema.js";

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
  uploadedAt?: Date;
  sentAt?: Date | null;
  sentOn?: string | null;
  listDate?: string | null;
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
      sourceKind: "PDF",
      fileName: seed.fileName ?? "lista.pdf",
      fileByteSize: 1_000,
      state: seed.state ?? "READING",
      readFailure: seed.readFailure ?? null,
      uploadedAt: seed.uploadedAt ?? new Date("2026-03-01T12:00:00.000Z"),
      uploadedBy: seed.actorId,
      sentAt: seed.sentAt ?? null,
      sentOn: seed.sentOn ?? null,
      listDate: seed.listDate ?? null,
      confirmedAt: seed.confirmedAt ?? null,
      version: seed.version ?? 1,
    })
    .returning({ id: supplierPriceLists.id });
  if (!list) {
    throw new Error("test setup: seeding the price list returned no row");
  }
  return list.id;
}

export interface PriceListRowSeed {
  description?: string;
  code?: string | null;
  presentation?: string | null;
  priceCents?: number | null;
  page?: number | null;
}

export async function insertPriceListRows<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  listId: string,
  rows: PriceListRowSeed[],
): Promise<string[]> {
  const inserted = await db
    .insert(supplierPriceListRows)
    .values(
      rows.map((row, position) => ({
        listId,
        position,
        description: row.description ?? `Producto ${position}`,
        supplierCode: row.code ?? null,
        presentation: row.presentation ?? null,
        priceCents: row.priceCents === undefined ? 100 : row.priceCents,
        page: row.page ?? null,
      })),
    )
    .returning({ id: supplierPriceListRows.id, position: supplierPriceListRows.position });
  return inserted.sort((first, second) => first.position - second.position).map(({ id }) => id);
}
