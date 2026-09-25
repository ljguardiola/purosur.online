import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { productBarcodes } from "../db/schema.js";
import {
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";
import { appendEan13CheckDigit } from "./ean13-check-digit.js";
import type { ProductsRouteOptions } from "./products-list-route.js";

const INTERNAL_BARCODE_SEQUENCE_NAME = "internal_barcode_sequence";
const NEXTVAL_QUERY = sql.raw(`select nextval('${INTERNAL_BARCODE_SEQUENCE_NAME}') as value`);

// `db.execute`'s result shape differs by driver: node-postgres and PGlite return `{ rows }`,
// postgres-js returns the row array itself. The same kind of driver-shape normalization
// `isBarcodeUniqueViolation` (`product-creation-route.ts`) already does for error objects.
function rowsOf<TRow>(result: unknown): TRow[] {
  if (Array.isArray(result)) {
    return result;
  }
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as TRow[]) : [];
}

async function nextSequenceValue<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Promise<bigint> {
  const result = await db.execute<{ value: string }>(NEXTVAL_QUERY);
  const [row] = rowsOf<{ value: string }>(result);
  if (!row) {
    throw new Error("internal-barcode: nextval returned no row");
  }
  return BigInt(row.value);
}

/**
 * Allocates an internal EAN-13 barcode for a product with no manufacturer barcode: pulls the next
 * value from `internal_barcode_sequence` (GS1's 20-29 restricted-circulation range, see
 * `db/schema.ts`), appends its check digit, and skips any code that already exists on
 * `product_barcodes` by pulling another value, so a sequence value is never handed out twice and a
 * concurrent allocation racing this one is always given a different one. The range holds around
 * 10^11 codes, so the sequence running out is not a real case: it errors like any unexpected
 * database failure instead of a handled outcome.
 */
export async function allocateInternalBarcode<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Promise<string> {
  for (;;) {
    const value = await nextSequenceValue(db);
    const code = appendEan13CheckDigit(value.toString());
    const [existing] = await db
      .select({ code: productBarcodes.code })
      .from(productBarcodes)
      .where(eq(productBarcodes.code, code))
      .limit(1);
    if (!existing) {
      return code;
    }
  }
}

/**
 * Registers `POST /products/internal-barcode`, gated by the `manage_products_and_categories`
 * permission (an Administrator always holds it too), the same access and origin-check shape
 * `POST /products` uses.
 */
export function registerInternalBarcodeRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: ProductsRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.post(
    "/products/internal-barcode",
    {
      preHandler: originGuard((request, reply) => {
        if (request.headers.origin !== options.backofficeOrigin) {
          void reply.code(403).send({
            code: "origin_rejected",
            message: "the request's Origin does not match the backoffice's own origin",
          });
          return false;
        }
        return true;
      }),
      config: {
        access: permissionAccess("manage_products_and_categories"),
        sessionSource,
      },
    },
    async (_request, reply) => {
      const code = await allocateInternalBarcode(options.db);
      await reply.code(200).send({ code });
    },
  );
}
