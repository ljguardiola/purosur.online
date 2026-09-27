import { appendEan13CheckDigit } from "@purosur/contracts";
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
import type { ProductsRouteOptions } from "./products-list-route.js";

const INTERNAL_BARCODE_SEQUENCE_NAME = "internal_barcode_sequence";
const NEXTVAL_QUERY = sql.raw(`select nextval('${INTERNAL_BARCODE_SEQUENCE_NAME}') as value`);

// `db.execute`'s result shape differs by driver: node-postgres and PGlite return `{ rows }`,
// postgres-js returns the row array itself.
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
