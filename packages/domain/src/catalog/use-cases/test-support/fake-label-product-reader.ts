import type { LabelProduct, LabelProductReader } from "../label-product-reader.js";

export class FakeLabelProductReader implements LabelProductReader {
  private readonly products: LabelProduct[];
  readonly requestedProductIds: (readonly string[])[] = [];

  constructor(products: LabelProduct[]) {
    this.products = products;
  }

  async productsForLabels(productIds: readonly string[]): Promise<LabelProduct[]> {
    this.requestedProductIds.push(productIds);
    return this.products.filter((product) => productIds.includes(product.id));
  }
}
