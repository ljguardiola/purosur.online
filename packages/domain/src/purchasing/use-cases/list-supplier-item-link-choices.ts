import type { SaleUnit } from "../../catalog/index.js";
import { mayBuyByPackaging } from "../model/packaging.js";
import {
  DEFAULT_SUPPLIER_ITEM_VAT_RATE,
  SUPPLIER_ITEM_VAT_RATES,
  type SupplierItemVatRate,
} from "../model/supplier-item.js";
import type { PurchasingListReader } from "./purchasing-list-reader.js";

export interface SupplierItemLinkChoice {
  id: string;
  name: string;
  saleUnit: SaleUnit;
  packagings: { id: string; name: string; quantityPerPackage: number }[];
}

export interface SupplierItemLinkChoices {
  products: SupplierItemLinkChoice[];
  vatRates: { offered: SupplierItemVatRate[]; default: SupplierItemVatRate };
}

export async function listSupplierItemLinkChoices(
  reader: PurchasingListReader,
  products: { id: string; name: string; saleUnit: SaleUnit }[],
): Promise<SupplierItemLinkChoices> {
  const packagings = await reader.packagings();
  const choices = products.map(({ id, name, saleUnit }) => ({
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
  return {
    products: choices,
    vatRates: { offered: [...SUPPLIER_ITEM_VAT_RATES], default: DEFAULT_SUPPLIER_ITEM_VAT_RATE },
  };
}
