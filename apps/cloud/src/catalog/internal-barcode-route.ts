import { appendEan13CheckDigit } from "@purosur/domain";
import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { backofficeOriginGuard } from "../access/backoffice-origin.js";
import {
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { productBarcodes } from "../platform/db/schema.js";
import type { ProductsRouteOptions } from "./products-list-route.js";

const INTERNAL_BARCODE_SEQUENCE_NAME = "internal_barcode_sequence";
const NEXTVAL_QUERY = sql.raw(`select nextval('${INTERNAL_BARCODE_SEQUENCE_NAME}') as value`);

// `db.execute`'s result shape differs by driver: node-postgres and PGlite return `{ rows }`,
// postgres-js returns the row array itself.
function rowsOf(result: unknown): unknown[] {
  if (Array.isArray(result)) {
    return result;
  }
  if (typeof result === "object" && result !== null && "rows" in result) {
    return Array.isArray(result.rows) ? result.rows : [];
  }
  return [];
}

export function sequenceValueOf(result: unknown): bigint {
  const [row] = rowsOf(result);
  if (row === undefined) {
    throw new Error("internal-barcode: nextval returned no row");
  }
  if (typeof row === "object" && row !== null && "value" in row) {
    const { value } = row;
    if (
      typeof value === "string" ||
      typeof value === "bigint" ||
      (typeof value === "number" && Number.isInteger(value))
    ) {
      return BigInt(value);
    }
  }
  throw new Error("internal-barcode: nextval returned a row without an integer value");
}

async function nextSequenceValue<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Promise<bigint> {
  return sequenceValueOf(await db.execute(NEXTVAL_QUERY));
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
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
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
