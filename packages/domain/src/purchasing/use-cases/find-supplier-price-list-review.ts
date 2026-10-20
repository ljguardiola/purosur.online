import {
  isSupplierPriceListDiscardable,
  isSupplierPriceListUnderReview,
} from "../model/supplier-price-list.js";
import { type ListedSupplierPriceList, replacedListIds } from "./list-supplier-price-lists.js";
import type {
  SupplierPriceListReader,
  SupplierPriceListReview,
} from "./supplier-price-list-reader.js";

interface SupplierPriceListReviewActions {
  changeRows: boolean;
  confirm: boolean;
  discard: boolean;
}

export type FoundSupplierPriceListReview =
  | { kind: "not_found" }
  | {
      kind: "found";
      list: ListedSupplierPriceList & { version: number };
      rows: SupplierPriceListReview["rows"];
      actions: SupplierPriceListReviewActions;
    };

export async function findSupplierPriceListReview(
  reader: SupplierPriceListReader,
  listId: string,
): Promise<FoundSupplierPriceListReview> {
  const review = await reader.review(listId);
  if (!review) {
    return { kind: "not_found" };
  }
  const { confirmedAt: _confirmedAt, ...list } = review.list;
  const underReview = isSupplierPriceListUnderReview(list.state);
  return {
    kind: "found",
    list: { ...list, replaced: replacedListIds(await reader.lists()).has(listId) },
    rows: review.rows,
    actions: {
      changeRows: underReview,
      confirm: underReview,
      discard: isSupplierPriceListDiscardable(list.state),
    },
  };
}
