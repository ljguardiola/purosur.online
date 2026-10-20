import type {
  SupplierPriceListReader,
  SupplierPriceListReview,
} from "./supplier-price-list-reader.js";

export type FoundSupplierPriceListReview =
  | { kind: "not_found" }
  | ({ kind: "found" } & SupplierPriceListReview);

export async function findSupplierPriceListReview(
  reader: SupplierPriceListReader,
  listId: string,
): Promise<FoundSupplierPriceListReview> {
  const review = await reader.review(listId);
  return review ? { kind: "found", ...review } : { kind: "not_found" };
}
