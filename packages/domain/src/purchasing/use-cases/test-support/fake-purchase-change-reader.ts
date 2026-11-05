import type {
  PurchaseChangeListing,
  PurchaseChangeProduct,
  PurchaseChangeReader,
} from "../purchase-change-reader.js";

export class FakePurchaseChangeReader implements PurchaseChangeReader {
  private readonly purchases = new Map<string, PurchaseChangeListing[]>();
  private readonly lines = new Map<string, Map<string, string>>();
  private readonly products = new Map<string, PurchaseChangeProduct>();
  askedFor: string[] = [];

  seed(
    locationId: string,
    purchaseId: string,
    changes: PurchaseChangeListing[],
    productOfLine: Record<string, string> = {},
  ): void {
    this.purchases.set(`${locationId}:${purchaseId}`, changes);
    this.lines.set(purchaseId, new Map(Object.entries(productOfLine)));
  }

  seedProducts(...products: PurchaseChangeProduct[]): void {
    for (const product of products) {
      this.products.set(product.id, { ...product });
    }
  }

  async purchaseChanges(
    locationId: string,
    purchaseId: string,
  ): Promise<PurchaseChangeListing[] | undefined> {
    this.askedFor.push(`${locationId}:${purchaseId}`);
    return this.purchases.get(`${locationId}:${purchaseId}`)?.map((change) => ({ ...change }));
  }

  async productOfEachLine(purchaseId: string): Promise<Map<string, string>> {
    this.askedFor.push(`lines:${purchaseId}`);
    return new Map(this.lines.get(purchaseId));
  }

  async describedProducts(
    productIds: readonly string[],
  ): Promise<Map<string, PurchaseChangeProduct>> {
    this.askedFor.push(`products:${[...productIds].sort().join(",")}`);
    return new Map(
      productIds.flatMap((id) => {
        const product = this.products.get(id);
        return product ? [[id, { ...product }] as const] : [];
      }),
    );
  }
}
