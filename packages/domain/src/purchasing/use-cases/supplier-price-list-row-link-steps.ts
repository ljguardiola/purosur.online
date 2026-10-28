import {
  isSupplierItemVatRate,
  keepingRememberedVatRate,
  requiresVatRate,
  supplierItemKey,
} from "../model/supplier-item.js";
import type {
  LockedSupplierPriceList,
  SupplierItemLink,
  SupplierPriceListStoreTransaction,
} from "./supplier-price-list-store.js";

export type RowVatRateDecision =
  | { kind: "refused"; refusal: "vat_rate_invalid" | "vat_rate_missing" }
  | { kind: "decided"; vatRate: number | null };

export function decideRowVatRate(
  pricesIncludeVat: boolean | null,
  vatRate: number | null,
): RowVatRateDecision {
  if (vatRate !== null && !isSupplierItemVatRate(vatRate)) {
    return { kind: "refused", refusal: "vat_rate_invalid" };
  }
  const rateApplies = requiresVatRate(pricesIncludeVat);
  if (rateApplies && vatRate === null) {
    return { kind: "refused", refusal: "vat_rate_missing" };
  }
  return { kind: "decided", vatRate: rateApplies ? vatRate : null };
}

export async function linkRowAndRememberItem(
  tx: Pick<
    SupplierPriceListStoreTransaction,
    "linkRow" | "lockSupplierItems" | "rememberSupplierItemLink"
  >,
  target: {
    list: Pick<LockedSupplierPriceList, "state" | "supplierId">;
    listId: string;
    rowId: string;
    row: { description: string; code: string | null; presentation: string | null };
  },
  link: SupplierItemLink,
  actorId: string,
): Promise<void> {
  await tx.linkRow(target.listId, target.rowId, link, actorId);

  if (target.list.state === "REVIEWED") {
    const key = supplierItemKey(target.row);
    const [item] = await tx.lockSupplierItems(target.list.supplierId, [key]);
    if (item) {
      await tx.rememberSupplierItemLink(item.id, keepingRememberedVatRate(link, item.link));
    }
  }
}
