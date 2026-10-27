import type {
  ComparableProduct,
  SupplierOffer,
  SupplierPriceComparisonReader,
} from "../supplier-price-comparison-reader.js";

export class FakeSupplierPriceComparisonReader implements SupplierPriceComparisonReader {
  products: ComparableProduct[];
  offersList: SupplierOffer[];

  constructor(products: ComparableProduct[] = [], offers: SupplierOffer[] = []) {
    this.products = products;
    this.offersList = offers;
  }

  async activeProducts(): Promise<ComparableProduct[]> {
    return [...this.products];
  }

  async offers(): Promise<SupplierOffer[]> {
    return [...this.offersList];
  }
}
