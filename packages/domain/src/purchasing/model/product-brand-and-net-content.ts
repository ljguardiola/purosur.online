import type { NetContentUnit } from "../../catalog/index.js";

export interface ProductBrandAndNetContent {
  brandName: string | null;
  netContent: { quantity: number; unit: NetContentUnit } | null;
}
