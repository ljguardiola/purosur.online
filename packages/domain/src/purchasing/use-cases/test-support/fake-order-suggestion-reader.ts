import type { SoldLinesOfGroup } from "../../../sales/index.js";
import type {
  AwaitedOrderLine,
  NewestShelfLifeLot,
  OrderSuggestionReader,
  OrderSuggestionSalesQuery,
  OrderSuggestionSupplier,
  ProductCoverageDays,
  ProductStock,
} from "../order-suggestion-reader.js";
import type { ComparableProduct, SupplierOffer } from "../supplier-price-comparison-reader.js";
import { FakeSupplierPriceComparisonReader } from "./fake-supplier-price-comparison-reader.js";

export class FakeOrderSuggestionReader
  extends FakeSupplierPriceComparisonReader
  implements OrderSuggestionReader
{
  coverage: ProductCoverageDays[] = [];
  sold: SoldLinesOfGroup[] = [];
  stock: ProductStock[] = [];
  awaitedLines: AwaitedOrderLine[] = [];
  supplierList: OrderSuggestionSupplier[] = [];
  shelfLifeLots: NewestShelfLifeLot[] = [];
  readonly salesQueries: OrderSuggestionSalesQuery[] = [];
  readonly stockQueries: string[] = [];
  readonly awaitedQueries: string[] = [];
  readonly shelfLifeQueries: string[] = [];

  constructor(products: ComparableProduct[] = [], offers: SupplierOffer[] = []) {
    super(products, offers);
  }

  async coverageDays(): Promise<ProductCoverageDays[]> {
    return [...this.coverage];
  }

  async completedSalesByProduct(query: OrderSuggestionSalesQuery): Promise<SoldLinesOfGroup[]> {
    this.salesQueries.push(query);
    return [...this.sold];
  }

  async currentStock(locationId: string): Promise<ProductStock[]> {
    this.stockQueries.push(locationId);
    return [...this.stock];
  }

  async awaitedOrderLines(locationId: string): Promise<AwaitedOrderLine[]> {
    this.awaitedQueries.push(locationId);
    return [...this.awaitedLines];
  }

  async newestShelfLifeLots(locationId: string): Promise<NewestShelfLifeLot[]> {
    this.shelfLifeQueries.push(locationId);
    return [...this.shelfLifeLots];
  }

  async suppliers(): Promise<OrderSuggestionSupplier[]> {
    return [...this.supplierList];
  }
}
