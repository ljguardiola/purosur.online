import type { NetContentUnit } from "../../catalog/index.js";

export interface ProductNetContent {
  quantity: number;
  unit: NetContentUnit;
}

export interface ProductBrandAndNetContent {
  brandName: string | null;
  netContent: ProductNetContent | null;
}
