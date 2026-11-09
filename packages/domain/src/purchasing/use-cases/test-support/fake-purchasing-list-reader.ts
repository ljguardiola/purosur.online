import { compareSpanishText } from "../../../shared/index.js";
import type { LotNameFacts } from "../../../stock/index.js";
import type {
  LinkedFreightListing,
  PurchaseListing,
  PurchasingListReader,
} from "../purchasing-list-reader.js";
import type { Supplier } from "../purchasing-store.js";

export interface FakePurchasingListData {
  suppliers?: Supplier[];
  purchases?: PurchaseListing[];
  lots?: LotNameFacts[];
  freights?: LinkedFreightListing[];
}

function byName(first: { name: string }, second: { name: string }): number {
  return compareSpanishText(first.name, second.name);
}

export class FakePurchasingListReader implements PurchasingListReader {
  readonly lotNameReads: { locationId: string; productIds: string[] }[] = [];
  readonly linkedFreightReads: string[][] = [];
  private readonly data: Required<FakePurchasingListData>;

  constructor(data: FakePurchasingListData = {}) {
    this.data = {
      suppliers: data.suppliers ?? [],
      purchases: data.purchases ?? [],
      lots: data.lots ?? [],
      freights: data.freights ?? [],
    };
  }

  async suppliers(): Promise<Supplier[]> {
    return [...this.data.suppliers].sort(byName);
  }

  async supplierName(supplierId: string): Promise<string | undefined> {
    return this.data.suppliers.find((supplier) => supplier.id === supplierId)?.name;
  }

  async purchases(locationId: string, supplierId?: string): Promise<PurchaseListing[]> {
    return this.data.purchases.filter(
      (purchase) =>
        purchase.locationId === locationId &&
        (supplierId === undefined || purchase.supplier.id === supplierId),
    );
  }

  async lotNameFacts(locationId: string, productIds: readonly string[]): Promise<LotNameFacts[]> {
    this.lotNameReads.push({ locationId, productIds: [...productIds] });
    return this.data.lots.filter(
      (lot) => lot.locationId === locationId && productIds.includes(lot.productId),
    );
  }

  async linkedFreights(purchaseIds: readonly string[]): Promise<LinkedFreightListing[]> {
    this.linkedFreightReads.push([...purchaseIds]);
    return this.data.freights.filter((freight) => purchaseIds.includes(freight.purchaseId));
  }

  async purchase(purchaseId: string): Promise<PurchaseListing | undefined> {
    return this.data.purchases.find((purchase) => purchase.id === purchaseId);
  }
}
