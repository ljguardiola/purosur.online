import type { NetContentUnit, SaleUnit } from "@purosur/domain";
import type { CatalogNetContent } from "@purosur/domain/catalog/use-cases";
import { asc, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import {
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { categories, productBarcodes, products } from "../platform/db/schema.js";

type ProductStatusFilter = "active" | "inactive" | "all";

const PRODUCT_STATUS_FILTERS: ProductStatusFilter[] = ["active", "inactive", "all"];

function readProductStatusFilter(
  raw: unknown,
): ProductStatusFilter | { field: "status"; message: string } {
  if (raw === undefined) {
    return "active";
  }
  if (typeof raw === "string" && (PRODUCT_STATUS_FILTERS as string[]).includes(raw)) {
    return raw as ProductStatusFilter;
  }
  return { field: "status", message: "status must be one of active, inactive, or all" };
}

export interface ProductsRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now?: () => Date;
}

interface ProductRow {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  saleUnit: SaleUnit;
  barcodes: string[];
  netContent: CatalogNetContent | null;
  active: boolean;
  version: number;
}

interface ProductWithoutBarcodes {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  saleUnit: string;
  netContentQuantity: number | null;
  netContentUnit: string | null;
  active: boolean;
  version: number;
}

function netContentRow(row: {
  netContentQuantity: number | null;
  netContentUnit: string | null;
}): CatalogNetContent | null {
  if (row.netContentQuantity === null || row.netContentUnit === null) {
    return null;
  }
  return { quantity: row.netContentQuantity, unit: row.netContentUnit as NetContentUnit };
}

async function barcodesByProductId<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  productIds: string[],
): Promise<Map<string, string[]>> {
  if (productIds.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({ productId: productBarcodes.productId, code: productBarcodes.code })
    .from(productBarcodes)
    .where(inArray(productBarcodes.productId, productIds))
    .orderBy(asc(productBarcodes.position));

  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const existing = grouped.get(row.productId);
    if (existing) {
      existing.push(row.code);
    } else {
      grouped.set(row.productId, [row.code]);
    }
  }
  return grouped;
}

async function listProducts<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  status: ProductStatusFilter = "active",
): Promise<ProductRow[]> {
  const rows: ProductWithoutBarcodes[] = await db
    .select({
      id: products.id,
      name: products.name,
      categoryId: products.categoryId,
      categoryName: categories.name,
      saleUnit: products.saleUnit,
      netContentQuantity: products.netContentQuantity,
      netContentUnit: products.netContentUnit,
      active: products.active,
      version: products.version,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(status === "all" ? undefined : eq(products.active, status === "active"))
    .orderBy(asc(products.name));

  const barcodes = await barcodesByProductId(
    db,
    rows.map((row) => row.id),
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    saleUnit: row.saleUnit as SaleUnit,
    barcodes: barcodes.get(row.id) ?? [],
    netContent: netContentRow(row),
    active: row.active,
    version: row.version,
  }));
}

export function registerProductsListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: ProductsRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get<{ Querystring: { status?: string } }>(
    "/products",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: {
        access: permissionAccess("manage_products_and_categories"),
        sessionSource,
      },
    },
    async (request, reply) => {
      const status = readProductStatusFilter(request.query.status);
      if (typeof status !== "string") {
        await reply.code(400).send({
          code: "validation_failed",
          message: status.message,
          details: [{ field: status.field }],
        });
        return;
      }

      const rows = await listProducts(options.db, status);
      await reply.code(200).send(rows);
    },
  );
}
