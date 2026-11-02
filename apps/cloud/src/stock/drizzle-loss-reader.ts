import {
  ARGENTINA_TIME_ZONE,
  LOSS_REPORT_MOVEMENT_KINDS,
  reportedLossReason,
  type SaleUnit,
} from "@purosur/domain";
import type { LossQuery, LossReader, LossRecord } from "@purosur/domain/stock/use-cases";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { netContentRow } from "../catalog/net-content-row.js";
import { brands, products, returnLines, stockMovements } from "../platform/db/schema.js";

const lossDay = sql<string>`to_char(${stockMovements.occurredAt} at time zone ${ARGENTINA_TIME_ZONE}, 'YYYY-MM-DD')`;

function reasonOf(row: {
  kind: string;
  reason: string | null;
  resolution: string | null;
}): LossRecord["reason"] {
  const reason = reportedLossReason({
    kind: row.kind,
    reason: row.reason,
    exchanged: row.resolution === "exchange",
  });
  if (reason === null) {
    throw new Error(`A stored loss has an unknown reason: ${row.reason}`);
  }
  return reason;
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
            kind: stockMovements.kind,
            reason: stockMovements.reason,
            resolution: returnLines.resolution,
            delta: stockMovements.delta,
            productId: products.id,
            productName: products.name,
            brandName: brands.name,
            netContentQuantity: products.netContentQuantity,
            netContentUnit: products.netContentUnit,
            saleUnit: products.saleUnit,
          })
          .from(stockMovements)
          .innerJoin(products, eq(products.id, stockMovements.productId))
          .leftJoin(brands, eq(brands.id, products.brandId))
          .leftJoin(
            returnLines,
            and(
              eq(returnLines.returnId, stockMovements.returnId),
              eq(returnLines.saleLineId, stockMovements.saleLineId),
            ),
          )
          .where(
            and(
              eq(stockMovements.locationId, locationId),
              inArray(stockMovements.kind, LOSS_REPORT_MOVEMENT_KINDS),
              sql`${lossDay} >= ${range.from}`,
              sql`${lossDay} <= ${range.to}`,
            ),
          );
        return rows.map((row) => ({
          reason: reasonOf(row),
          product: {
            id: row.productId,
            name: row.productName,
            brandName: row.brandName,
            netContent: netContentRow(row),
            saleUnit: row.saleUnit as SaleUnit,
          },
          quantity: -row.delta,
        }));
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }
}
