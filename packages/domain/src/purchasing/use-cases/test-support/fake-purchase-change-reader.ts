import type { PurchaseChangeListing, PurchaseChangeReader } from "../purchase-change-reader.js";

export class FakePurchaseChangeReader implements PurchaseChangeReader {
  private readonly purchases = new Map<string, PurchaseChangeListing[]>();
  askedFor: string[] = [];

  seed(locationId: string, purchaseId: string, changes: PurchaseChangeListing[]): void {
    this.purchases.set(`${locationId}:${purchaseId}`, changes);
  }

  async purchaseChanges(
    locationId: string,
    purchaseId: string,
  ): Promise<PurchaseChangeListing[] | undefined> {
    this.askedFor.push(`${locationId}:${purchaseId}`);
    return this.purchases.get(`${locationId}:${purchaseId}`)?.map((change) => ({ ...change }));
  }
}
