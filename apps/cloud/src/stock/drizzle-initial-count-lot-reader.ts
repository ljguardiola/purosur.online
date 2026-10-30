import type { SaleUnit } from "@purosur/domain";
import type {
  InitialCountLotReader,
  InitialCountLotRow,
  InitialCountLotsQuery,
} from "@purosur/domain/stock/use-cases";
import { and, eq, inArray, isNotNull, type SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { netContentRow } from "../catalog/net-content-row.js";
import { productIdsWithDescriptionContainingEveryWord } from "../catalog/product-ids-with-description-containing-every-word.js";
import { brands, categories, lots, products } from "../platform/db/schema.js";
import { loadedSupplierPricesOf } from "./loaded-supplier-prices.js";

export class DrizzleInitialCountLotReader<TQueryResult extends PgQueryResultHKT>
  implements InitialCountLotReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async initialCountLots(query: InitialCountLotsQuery): Promise<InitialCountLotRow[]> {
    const lotsOfTheCount = and(
      eq(lots.locationId, query.locationId),
      isNotNull(lots.originMovementId),
      query.costIncomplete === undefined
        ? undefined
        : eq(lots.costIncomplete, query.costIncomplete),
    );
    const productIds =
      query.productName === undefined
        ? undefined
        : await this.productIdsDescribedBy(lotsOfTheCount, query.productName);
    if (productIds?.size === 0) {
      return [];
    }
    const rows = await this.db
      .select({
        lotId: lots.id,
        productId: products.id,
        productName: products.name,
        brandName: brands.name,
        netContentQuantity: products.netContentQuantity,
        netContentUnit: products.netContentUnit,
        categoryName: categories.name,
        saleUnit: products.saleUnit,
        expiresOn: lots.expiresOn,
        counted: lots.quantityReceived,
        withdrawn: lots.withdrawn,
        remaining: lots.remaining,
        costIncomplete: lots.costIncomplete,
        costTotalCents: lots.costTotalCents,
        costQuantity: lots.costQuantity,
      })
      .from(lots)
      .innerJoin(products, eq(products.id, lots.productId))
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(
        and(
          lotsOfTheCount,
          productIds === undefined ? undefined : inArray(lots.productId, [...productIds]),
        ),
      );
    const pricesByProduct = await loadedSupplierPricesOf(this.db, [
      ...new Set(rows.map((row) => row.productId)),
    ]);
    return rows.map(
      ({ costTotalCents, costQuantity, saleUnit, netContentQuantity, netContentUnit, ...row }) => ({
        ...row,
        netContent: netContentRow({ netContentQuantity, netContentUnit }),
        supplierPrices: pricesByProduct.get(row.productId) ?? [],
        saleUnit: saleUnit as SaleUnit,
        cost:
          costTotalCents === null || costQuantity === null
            ? null
            : { totalCents: costTotalCents, quantity: costQuantity },
      }),
    );
  }

  private async productIdsDescribedBy(
    lotsOfTheCount: SQL | undefined,
    search: string,
  ): Promise<Set<string>> {
    const candidates = await this.db
      .selectDistinct({
        id: products.id,
        name: products.name,
        brandName: brands.name,
        netContentQuantity: products.netContentQuantity,
        netContentUnit: products.netContentUnit,
      })
      .from(lots)
      .innerJoin(products, eq(products.id, lots.productId))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(lotsOfTheCount);
    return productIdsWithDescriptionContainingEveryWord(
      this.db,
      candidates.map(({ netContentQuantity, netContentUnit, ...candidate }) => ({
        ...candidate,
        netContent: netContentRow({ netContentQuantity, netContentUnit }),
      })),
      search,
    );
  }
}
