import type { SaleUnit } from "../../catalog/index.js";
import type { Fraction } from "../../shared/index.js";
import { mayBuyByPackaging } from "../model/packaging.js";
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
  SupplierPriceListReviewRowLink,
} from "./supplier-price-list-reader.js";

interface SupplierPriceListReviewActions {
  changeRows: boolean;
  confirm: boolean;
  discard: boolean;
  linkRows: boolean;
  markRowsReviewed: boolean;
}

export interface FoundSupplierPriceListReviewRowLink {
  product: { id: string; name: string; saleUnit: SaleUnit };
  // Whether the item may still be bought by the packaging, which only then prices its sale unit.
  packaging: { id: string; name: string; quantityPerPackage: number; buyable: boolean };
  vatRate: number | null;
}

export interface FoundSupplierPriceListReviewRow
  extends Omit<SupplierPriceListReviewRow, "reviewed" | "earlier" | "link"> {
  link: FoundSupplierPriceListReviewRowLink | null;
  status: SupplierPriceListRowStatus;
  needsReview: boolean;
  // What the supplier's other lists recorded as the price, only for a row whose price changed.
  previousPriceCents: number | null;
  // Cents per sale unit with VAT, exact; null for a row without a link, a price or the rate its
  // list needs, and for one linked to a packaging it may no longer be bought by.
  pricePerSaleUnit: Fraction | null;
}

export type FoundSupplierPriceListReview =
  | { kind: "not_found" }
  | {
      kind: "found";
      list: ListedSupplierPriceList & {
        version: number;
        pricesIncludeVat: boolean | null;
        requiresVatRate: boolean;
      };
      rows: FoundSupplierPriceListReviewRow[];
      counts: { needingReview: number; linkedAutomatically: number };
      actions: SupplierPriceListReviewActions;
    };

function foundLink(link: SupplierPriceListReviewRowLink): FoundSupplierPriceListReviewRowLink {
  const { active, saleUnit, ...packaging } = link.packaging;
  return {
    ...link,
    packaging: {
      ...packaging,
      buyable: mayBuyByPackaging({ active, saleUnit }, link.product.saleUnit),
    },
  };
}

function reviewedRow(
  { reviewed, earlier, link: readLink, ...row }: SupplierPriceListReviewRow,
  pricesIncludeVat: boolean | null,
): FoundSupplierPriceListReviewRow {
  const link = readLink === null ? null : foundLink(readLink);
  const status = supplierPriceListRowStatus({
    reviewed,
    description: row.description,
    priceCents: row.priceCents,
    link,
    earlier,
    requiresVatRate: requiresVatRate(pricesIncludeVat),
  });
  return {
    ...row,
    link,
    status,
    needsReview: needsReview(status),
    previousPriceCents: status === "price_changed" ? (earlier?.priceCents ?? null) : null,
    pricePerSaleUnit:
      link === null || row.priceCents === null || !link.packaging.buyable
        ? null
        : pricePerSaleUnit({
            priceCents: row.priceCents,
            pricesIncludeVat,
            vatRate: link.vatRate,
            quantityPerPackage: link.packaging.quantityPerPackage,
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
    list: {
      ...list,
      replaced: replacedListIds(await reader.lists()).has(listId),
      requiresVatRate: requiresVatRate(list.pricesIncludeVat),
    },
    rows,
    counts: {
      needingReview: rows.filter((row) => row.needsReview).length,
      linkedAutomatically: rows.filter((row) => row.status === "linked").length,
    },
    actions: {
      changeRows: underReview,
      confirm: underReview,
      discard: isSupplierPriceListDiscardable(list.state),
      linkRows: maySupplierPriceListRowBeLinked(list.state),
      markRowsReviewed: underReview,
    },
  };
}
