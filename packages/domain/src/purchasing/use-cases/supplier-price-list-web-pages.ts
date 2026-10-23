import type { SupplierPriceListContentKind } from "../model/supplier-price-list.js";
import type { SupplierPriceListWebPageRefusal } from "../model/supplier-price-list-web-page.js";

export type SupplierPriceListWebPageRead =
  | { kind: "read"; contentKind: SupplierPriceListContentKind; bytes: Uint8Array }
  | { kind: "refused"; reason: SupplierPriceListWebPageRefusal };

export interface SupplierPriceListWebPages {
  // Answers a refusal for every page that cannot be read within the limits of the model.
  read(url: string): Promise<SupplierPriceListWebPageRead>;
}
