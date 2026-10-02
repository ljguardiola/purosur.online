import type { DiscountReader, StoredDiscount } from "../discount-reader.js";

export function fakeDiscountReader(stored: StoredDiscount[]): DiscountReader {
  return {
    discounts: () => Promise.resolve(stored),
    discount: (id) => Promise.resolve(stored.find((discount) => discount.id === id)),
  };
}
