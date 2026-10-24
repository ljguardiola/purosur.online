import type { SaleUnit } from "../../catalog/index.js";
import { mayBuyByPackaging } from "../model/packaging.js";
import type { PurchasingListReader } from "./purchasing-list-reader.js";

export interface SupplierItemLinkChoice {
  id: string;
  name: string;
  saleUnit: SaleUnit;
  packagings: { id: string; name: string; quantityPerPackage: number }[];
}

export async function listSupplierItemLinkChoices(
  reader: PurchasingListReader,
  products: { id: string; name: string; saleUnit: SaleUnit }[],
): Promise<SupplierItemLinkChoice[]> {
  const packagings = await reader.packagings();
  return products.map(({ id, name, saleUnit }) => ({
    id,
    name,
    saleUnit,
    packagings: packagings
      .filter((packaging) => packaging.productId === id && mayBuyByPackaging(packaging, saleUnit))
      .map(({ id: packagingId, name: packagingName, quantityPerPackage }) => ({
        id: packagingId,
        name: packagingName,
        quantityPerPackage,
      })),
  }));
}
