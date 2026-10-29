import type { NetContentUnit } from "../../catalog/index.js";
import type { DiscountFields } from "./discount-store.js";

export interface StoredDiscount extends Omit<DiscountFields, "target"> {
  id: string;
  target: DiscountFields["target"] & {
    name: string;
    brandName: string | null;
    netContent: { quantity: number; unit: NetContentUnit } | null;
  };
}

export interface DiscountReader {
  discounts(): Promise<StoredDiscount[]>;
  discount(id: string): Promise<StoredDiscount | undefined>;
}
