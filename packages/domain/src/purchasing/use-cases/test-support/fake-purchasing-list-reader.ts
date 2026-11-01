import { compareSpanishText } from "../../../shared/index.js";
import type { PurchaseListing, PurchasingListReader } from "../purchasing-list-reader.js";
import type { Supplier } from "../purchasing-store.js";

export interface FakePurchasingListData {
  suppliers?: Supplier[];
  purchases?: (PurchaseListing & { locationId: string })[];
}

function byName(first: { name: string }, second: { name: string }): number {
  return compareSpanishText(first.name, second.name);
}

export class FakePurchasingListReader implements PurchasingListReader {
  private readonly data: Required<FakePurchasingListData>;

  constructor(data: FakePurchasingListData = {}) {
    this.data = {
      suppliers: data.suppliers ?? [],
      purchases: data.purchases ?? [],
    };
  }

  async suppliers(): Promise<Supplier[]> {
    return [...this.data.suppliers].sort(byName);
  }

  async purchases(locationId: string): Promise<PurchaseListing[]> {
    return this.data.purchases.filter((purchase) => purchase.locationId === locationId);
  }

  async purchase(purchaseId: string): Promise<PurchaseListing | undefined> {
    return this.data.purchases.find((purchase) => purchase.id === purchaseId);
  }
}
