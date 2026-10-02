import type { DiscountFields } from "./discount-store.js";

export interface StoredDiscount extends Omit<DiscountFields, "target"> {
  id: string;
  target: DiscountFields["target"] & { name: string };
}

export interface DiscountReader {
  discounts(): Promise<StoredDiscount[]>;
  discount(id: string): Promise<StoredDiscount | undefined>;
}
