import { isSupplierPriceListUnderReview } from "../model/supplier-price-list.js";
import type { SupplierPriceListStore } from "./supplier-price-list-store.js";

export interface MarkSupplierPriceListRowReviewedInput {
  listId: string;
  rowId: string;
  version: number;
  actorId: string;
}

export type MarkSupplierPriceListRowReviewedOutcome =
  | { kind: "not_found" }
  | { kind: "not_editable" }
  | { kind: "stale_version" }
  | { kind: "reviewed" };

export function markSupplierPriceListRowReviewed(
  store: SupplierPriceListStore,
  input: MarkSupplierPriceListRowReviewedInput,
): Promise<MarkSupplierPriceListRowReviewedOutcome> {
  return store.transaction<MarkSupplierPriceListRowReviewedOutcome>(async (tx) => {
    const locked = await tx.lockList(input.listId);
    if (locked.kind === "not_found") {
      return { kind: "not_found" };
    }
    if (!isSupplierPriceListUnderReview(locked.list.state)) {
      return { kind: "not_editable" };
    }
    if (locked.list.version !== input.version) {
      return { kind: "stale_version" };
    }
    if ((await tx.lockRow(input.listId, input.rowId)).kind === "not_found") {
      return { kind: "not_found" };
    }

    await tx.markRowReviewed(input.listId, input.rowId, input.actorId);
    return { kind: "reviewed" };
  });
}
