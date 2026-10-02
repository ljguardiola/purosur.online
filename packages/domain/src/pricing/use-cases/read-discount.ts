import { type ListDiscountsPorts, type ListedDiscount, listedDiscount } from "./list-discounts.js";

export type ReadDiscountOutcome =
  | { kind: "found"; discount: ListedDiscount }
  | { kind: "not_found" };

export async function readDiscount(
  { discounts, clock }: ListDiscountsPorts,
  id: string,
): Promise<ReadDiscountOutcome> {
  const stored = await discounts.discount(id);
  return stored === undefined
    ? { kind: "not_found" }
    : { kind: "found", discount: listedDiscount(stored, clock) };
}
