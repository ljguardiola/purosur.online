import type { InternalBarcodeStore } from "@purosur/domain/catalog/use-cases";
import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { productBarcodes } from "../platform/db/schema.js";

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

export class DrizzleInternalBarcodeStore<TQueryResult extends PgQueryResultHKT>
  implements InternalBarcodeStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async nextSequenceValue(): Promise<bigint> {
    return sequenceValueOf(await this.db.execute(NEXTVAL_QUERY));
  }

  async isBarcodeAssigned(code: string): Promise<boolean> {
    const [assigned] = await this.db
      .select({ code: productBarcodes.code })
      .from(productBarcodes)
      .where(eq(productBarcodes.code, code))
      .limit(1);
    return assigned !== undefined;
  }
}
