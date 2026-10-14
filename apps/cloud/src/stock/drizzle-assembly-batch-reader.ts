import { isLotCostIncomplete, lotUnitCostCents, type SaleUnit } from "@purosur/domain";
import type {
  AssemblyBatchesQuery,
  AssemblyBatchListing,
  AssemblyBatchListReader,
  BatchLotReader,
  PreviewLot,
  ProductStockKey,
} from "@purosur/domain/stock/use-cases";
import { and, eq, gte, lt } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { assemblyBatches, lots, products } from "../platform/db/schema.js";

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
    return found.map(({ costTotalCents, costQuantity, costIncomplete, ...lot }) => ({
      ...lot,
      cost:
        costTotalCents === null || costQuantity === null
          ? null
          : { totalCents: costTotalCents, quantity: costQuantity },
      costIncomplete: isLotCostIncomplete({ technical: lot.technical, costIncomplete }),
    }));
  }
}
