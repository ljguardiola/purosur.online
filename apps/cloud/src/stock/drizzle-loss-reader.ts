import {
  ARGENTINA_TIME_ZONE,
  LOSS_REASONS,
  type SaleUnit,
  SYSTEM_LOSS_REASONS,
} from "@purosur/domain";
import type { LossQuery, LossReader, LossRecord } from "@purosur/domain/stock/use-cases";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { products, stockMovements } from "../platform/db/schema.js";

const lossDay = sql<string>`to_char(${stockMovements.occurredAt} at time zone ${ARGENTINA_TIME_ZONE}, 'YYYY-MM-DD')`;

const LOSS_REASON_CATALOG: readonly LossRecord["reason"][] = [
  ...LOSS_REASONS,
  ...SYSTEM_LOSS_REASONS,
];

function knownReason(stored: string | null): LossRecord["reason"] {
  const found = LOSS_REASON_CATALOG.find((reason) => reason === stored);
  if (found === undefined) {
    throw new Error(`A stored loss has an unknown reason: ${stored}`);
  }
  return found;
}

export class DrizzleLossReader<TQueryResult extends PgQueryResultHKT> implements LossReader {
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  lossesRecorded({ locationId, range }: LossQuery): Promise<LossRecord[]> {
    return this.db.transaction(
      async (tx) => {
        const rows = await tx
          .select({
            reason: stockMovements.reason,
            delta: stockMovements.delta,
            productId: products.id,
            productName: products.name,
            saleUnit: products.saleUnit,
          })
          .from(stockMovements)
          .innerJoin(products, eq(products.id, stockMovements.productId))
          .where(
            and(
              eq(stockMovements.locationId, locationId),
              eq(stockMovements.kind, "loss"),
              sql`${lossDay} >= ${range.from}`,
              sql`${lossDay} <= ${range.to}`,
            ),
          );
        return rows.map((row) => ({
          reason: knownReason(row.reason),
          product: { id: row.productId, name: row.productName, saleUnit: row.saleUnit as SaleUnit },
          quantity: -row.delta,
        }));
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }
}
