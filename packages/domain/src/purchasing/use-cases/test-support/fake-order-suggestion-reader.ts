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
  readonly readsOutsideSnapshot: string[] = [];
  snapshotsOpened = 0;
  private insideSnapshot = false;

  constructor(products: ComparableProduct[] = [], offers: SupplierOffer[] = []) {
    super(products, offers);
  }

  async inOneSnapshot<T>(read: (reader: OrderSuggestionReader) => Promise<T>): Promise<T> {
    this.snapshotsOpened += 1;
    this.insideSnapshot = true;
    try {
      return await read(this);
    } finally {
      this.insideSnapshot = false;
    }
  }

  private noteRead(name: string): void {
    if (!this.insideSnapshot) {
      this.readsOutsideSnapshot.push(name);
    }
  }

  override async activeProducts(): Promise<ComparableProduct[]> {
    this.noteRead("activeProducts");
    return super.activeProducts();
  }

  override async offers(): Promise<SupplierOffer[]> {
    this.noteRead("offers");
    return super.offers();
  }

  async coverageDays(): Promise<ProductCoverageDays[]> {
    this.noteRead("coverageDays");
    return [...this.coverage];
  }

  async completedSalesByProduct(query: OrderSuggestionSalesQuery): Promise<SoldLinesOfGroup[]> {
    this.noteRead("completedSalesByProduct");
    this.salesQueries.push(query);
    return [...this.sold];
  }

  async currentStock(locationId: string): Promise<ProductStock[]> {
    this.noteRead("currentStock");
    this.stockQueries.push(locationId);
    return [...this.stock];
  }

  async awaitedOrderLines(locationId: string): Promise<AwaitedOrderLine[]> {
    this.noteRead("awaitedOrderLines");
    this.awaitedQueries.push(locationId);
    return [...this.awaitedLines];
  }

  async newestShelfLifeLots(locationId: string): Promise<NewestShelfLifeLot[]> {
    this.noteRead("newestShelfLifeLots");
    this.shelfLifeQueries.push(locationId);
    return [...this.shelfLifeLots];
  }

  async suppliers(): Promise<OrderSuggestionSupplier[]> {
    this.noteRead("suppliers");
    return [...this.supplierList];
  }
}
