import type { Fraction } from "../../shared/index.js";
import {
  needsReview,
  pricePerSaleUnit,
  requiresVatRate,
  type SupplierPriceListRowStatus,
  supplierPriceListRowStatus,
} from "../model/supplier-item.js";
import {
  isSupplierPriceListDiscardable,
  isSupplierPriceListUnderReview,
  maySupplierPriceListRowBeLinked,
} from "../model/supplier-price-list.js";
import { type ListedSupplierPriceList, replacedListIds } from "./list-supplier-price-lists.js";
import type {
  SupplierPriceListReader,
  SupplierPriceListReviewRow,
} from "./supplier-price-list-reader.js";

interface SupplierPriceListReviewActions {
  changeRows: boolean;
  confirm: boolean;
  discard: boolean;
  linkRows: boolean;
}

export interface FoundSupplierPriceListReviewRow
  extends Omit<SupplierPriceListReviewRow, "reviewed" | "earlier"> {
  status: SupplierPriceListRowStatus;
  // What the supplier's other lists recorded as the price, only for a row whose price changed.
  previousPriceCents: number | null;
  // Cents per sale unit with VAT, exact; null for a row without a link, a price or the rate its
  // list needs.
  pricePerSaleUnit: Fraction | null;
}

export type FoundSupplierPriceListReview =
  | { kind: "not_found" }
  | {
      kind: "found";
      list: ListedSupplierPriceList & { version: number; pricesIncludeVat: boolean | null };
      rows: FoundSupplierPriceListReviewRow[];
      counts: { needingReview: number; linkedAutomatically: number };
      actions: SupplierPriceListReviewActions;
    };

function reviewedRow(
  { reviewed, earlier, ...row }: SupplierPriceListReviewRow,
  pricesIncludeVat: boolean | null,
): FoundSupplierPriceListReviewRow {
  const status = supplierPriceListRowStatus({
    reviewed,
    description: row.description,
    priceCents: row.priceCents,
    link: row.link,
    earlier,
    requiresVatRate: requiresVatRate(pricesIncludeVat),
  });
  return {
    ...row,
    status,
    previousPriceCents: status === "price_changed" ? (earlier?.priceCents ?? null) : null,
    pricePerSaleUnit:
      row.link === null || row.priceCents === null
        ? null
        : pricePerSaleUnit({
            priceCents: row.priceCents,
            pricesIncludeVat,
            vatRate: row.link.vatRate,
            quantityPerPackage: row.link.packaging.quantityPerPackage,
          }),
  };
}

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
  const rows = review.rows.map((row) => reviewedRow(row, list.pricesIncludeVat));
  return {
    kind: "found",
    list: { ...list, replaced: replacedListIds(await reader.lists()).has(listId) },
    rows,
    counts: {
      needingReview: rows.filter((row) => needsReview(row.status)).length,
      linkedAutomatically: rows.filter((row) => row.status === "linked").length,
    },
    actions: {
      changeRows: underReview,
      confirm: underReview,
      discard: isSupplierPriceListDiscardable(list.state),
      linkRows: maySupplierPriceListRowBeLinked(list.state),
    },
  };
}
