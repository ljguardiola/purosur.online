import type { NetContentUnit, SaleUnit } from "../../catalog/index.js";
import {
  DEFAULT_SUPPLIER_ITEM_VAT_RATE,
  SUPPLIER_ITEM_VAT_RATES,
  type SupplierItemVatRate,
} from "../model/supplier-item.js";

export interface SupplierItemLinkChoice {
  id: string;
  name: string;
  saleUnit: SaleUnit;
  brandName: string | null;
  netContent: { quantity: number; unit: NetContentUnit } | null;
}

export interface SupplierItemLinkChoices {
  products: SupplierItemLinkChoice[];
  vatRates: { offered: SupplierItemVatRate[]; default: SupplierItemVatRate };
}

export function listSupplierItemLinkChoices(
  products: {
    id: string;
    name: string;
    saleUnit: SaleUnit;
    brandId: string | null;
    netContent: { quantity: number; unit: NetContentUnit } | null;
  }[],
  brands: readonly { id: string; name: string }[],
): SupplierItemLinkChoices {
  return {
    products: products.map(({ id, name, saleUnit, brandId, netContent }) => ({
      id,
      name,
      saleUnit,
      brandName: brands.find((brand) => brand.id === brandId)?.name ?? null,
      netContent,
    })),
    vatRates: { offered: [...SUPPLIER_ITEM_VAT_RATES], default: DEFAULT_SUPPLIER_ITEM_VAT_RATE },
  };
}
