import type { NetContentUnit, SaleUnit } from "../../catalog/index.js";

export interface ProductTargetCandidate {
  id: string;
  name: string;
  active: boolean;
  saleUnit: SaleUnit;
  brandName: string | null;
  netContent: { quantity: number; unit: NetContentUnit } | null;
  barcodes: string[];
}

export interface CategoryTargetCandidate {
  id: string;
  name: string;
  parentId: string | null;
}

export interface TagTargetCandidate {
  id: string;
  name: string;
  active: boolean;
}

export interface DiscountTargetCandidates {
  products: ProductTargetCandidate[];
  categories: CategoryTargetCandidate[];
  tags: TagTargetCandidate[];
}

export interface DiscountTargetReader {
  targetCandidates(): Promise<DiscountTargetCandidates>;
}
