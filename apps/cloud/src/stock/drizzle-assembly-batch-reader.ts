import { lotUnitCostCents, type SaleUnit } from "@purosur/domain";
import type {
  AssemblyBatchesQuery,
  AssemblyBatchLineListing,
  AssemblyBatchListing,
  AssemblyBatchListReader,
  BatchLotReader,
  PreviewLot,
  ProductStockKey,
} from "@purosur/domain/stock/use-cases";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { assemblyBatches, assemblyBatchLines, lots, products } from "../platform/db/schema.js";

export class DrizzleAssemblyBatchReader<TQueryResult extends PgQueryResultHKT>
  implements AssemblyBatchListReader, BatchLotReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async batches(query: AssemblyBatchesQuery): Promise<AssemblyBatchListing[]> {
    const rows = await this.db
      .select({
        id: assemblyBatches.id,
        productId: assemblyBatches.productId,
        productName: products.name,
        saleUnit: products.saleUnit,
        assembledAt: assemblyBatches.assembledAt,
        output: assemblyBatches.outputQty,
        costTotalCents: lots.costTotalCents,
        costQuantity: lots.costQuantity,
        costIncomplete: lots.costIncomplete,
        expiresOn: lots.expiresOn,
      })
      .from(assemblyBatches)
      .innerJoin(products, eq(products.id, assemblyBatches.productId))
      .innerJoin(lots, eq(lots.assemblyBatchId, assemblyBatches.id))
      .where(
        and(
          eq(assemblyBatches.locationId, query.locationId),
          gte(assemblyBatches.assembledAt, query.from),
          lt(assemblyBatches.assembledAt, query.to),
        ),
      );
    const lines = await this.linesOf(rows.map((row) => row.id));
    return rows.map(({ costTotalCents, costQuantity, saleUnit, ...row }) => ({
      ...row,
      saleUnit: saleUnit as SaleUnit,
      unitCostCents: lotUnitCostCents({
        cost:
          costTotalCents === null || costQuantity === null
            ? null
            : { totalCents: costTotalCents, quantity: costQuantity },
        costIncomplete: row.costIncomplete,
      }),
      lines: lines.get(row.id) ?? [],
    }));
  }

  async productLots(key: ProductStockKey): Promise<PreviewLot[]> {
    const found = await this.db
      .select({
        id: lots.id,
        technical: lots.technical,
        expiresOn: lots.expiresOn,
        purchasedOn: lots.purchasedOn,
        receivedAt: lots.createdAt,
        remaining: lots.remaining,
        costTotalCents: lots.costTotalCents,
        costQuantity: lots.costQuantity,
        costIncomplete: lots.costIncomplete,
      })
      .from(lots)
      .where(and(eq(lots.productId, key.productId), eq(lots.locationId, key.locationId)));
    return found.map(({ costTotalCents, costQuantity, costIncomplete, technical, ...lot }) => ({
      ...lot,
      technical,
      cost:
        costTotalCents === null || costQuantity === null
          ? null
          : { totalCents: costTotalCents, quantity: costQuantity },
      costIncomplete: technical || costIncomplete,
    }));
  }

  private async linesOf(
    batchIds: readonly string[],
  ): Promise<Map<string, AssemblyBatchLineListing[]>> {
    const byBatch = new Map<string, AssemblyBatchLineListing[]>();
    if (batchIds.length === 0) {
      return byBatch;
    }
    const rows = await this.db
      .select({
        batchId: assemblyBatchLines.batchId,
        componentProductId: assemblyBatchLines.componentProductId,
        name: products.name,
        saleUnit: products.saleUnit,
        quantity: assemblyBatchLines.quantity,
      })
      .from(assemblyBatchLines)
      .innerJoin(products, eq(products.id, assemblyBatchLines.componentProductId))
      .where(inArray(assemblyBatchLines.batchId, [...batchIds]))
      .orderBy(products.name, assemblyBatchLines.componentProductId);
    for (const { batchId, ...line } of rows) {
      byBatch.set(batchId, [
        ...(byBatch.get(batchId) ?? []),
        { ...line, saleUnit: line.saleUnit as SaleUnit },
      ]);
    }
    return byBatch;
  }
}
