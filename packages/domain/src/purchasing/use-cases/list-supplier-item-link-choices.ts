import type { NetContentUnit, SaleUnit } from "../../catalog/index.js";
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
  brandName: string | null;
  netContent: { quantity: number; unit: NetContentUnit } | null;
  packagings: { id: string; name: string; quantityPerPackage: number }[];
}

export interface SupplierItemLinkChoices {
  products: SupplierItemLinkChoice[];
  vatRates: { offered: SupplierItemVatRate[]; default: SupplierItemVatRate };
}

export async function listSupplierItemLinkChoices(
  reader: PurchasingListReader,
  products: {
    id: string;
    name: string;
    saleUnit: SaleUnit;
    brandId: string | null;
    netContent: { quantity: number; unit: NetContentUnit } | null;
  }[],
  brands: readonly { id: string; name: string }[],
): Promise<SupplierItemLinkChoices> {
  const packagings = await reader.packagings();
  const choices = products.map(({ id, name, saleUnit, brandId, netContent }) => ({
    id,
    name,
    saleUnit,
    brandName: brands.find((brand) => brand.id === brandId)?.name ?? null,
    netContent,
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
