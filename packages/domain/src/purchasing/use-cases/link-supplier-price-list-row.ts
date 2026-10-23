import { mayBuyByPackaging } from "../model/packaging.js";
import { isSupplierItemVatRate, requiresVatRate, supplierItemKey } from "../model/supplier-item.js";
import { maySupplierPriceListRowBeLinked } from "../model/supplier-price-list.js";
import type { SupplierItemLink, SupplierPriceListStore } from "./supplier-price-list-store.js";

export interface LinkSupplierPriceListRowInput {
  listId: string;
  rowId: string;
  version: number;
  productId: string;
  packagingId: string;
  // In basis points; null when none was chosen.
  vatRate: number | null;
  actorId: string;
}

export type LinkSupplierPriceListRowOutcome =
  | { kind: "not_found" }
  | { kind: "not_editable" }
  | { kind: "stale_version" }
  | { kind: "packaging_not_linkable" }
  | { kind: "vat_rate_missing" }
  | { kind: "vat_rate_invalid" }
  | { kind: "linked" };

export function linkSupplierPriceListRow(
  store: SupplierPriceListStore,
  input: LinkSupplierPriceListRowInput,
): Promise<LinkSupplierPriceListRowOutcome> {
  return store.transaction<LinkSupplierPriceListRowOutcome>(async (tx) => {
    const locked = await tx.lockList(input.listId);
    if (locked.kind === "not_found") {
      return { kind: "not_found" };
    }
    const { list } = locked;
    if (!maySupplierPriceListRowBeLinked(list.state)) {
      return { kind: "not_editable" };
    }
    if (list.version !== input.version) {
      return { kind: "stale_version" };
    }
    const lockedRow = await tx.lockRow(input.listId, input.rowId);
    if (lockedRow.kind === "not_found") {
      return { kind: "not_found" };
    }

    const target = await tx.lockProductPackaging(input.productId, input.packagingId);
    if (
      target.kind === "not_found" ||
      !target.product.active ||
      target.packaging.productId !== input.productId ||
      !mayBuyByPackaging(target.packaging, target.product.saleUnit)
    ) {
      return { kind: "packaging_not_linkable" };
    }

    if (input.vatRate !== null && !isSupplierItemVatRate(input.vatRate)) {
      return { kind: "vat_rate_invalid" };
    }
    const rateApplies = requiresVatRate(list.pricesIncludeVat);
    if (rateApplies && input.vatRate === null) {
      return { kind: "vat_rate_missing" };
    }

    const link: SupplierItemLink = {
      productId: input.productId,
      packagingId: input.packagingId,
      vatRate: rateApplies ? input.vatRate : null,
    };
    await tx.linkRow(input.listId, input.rowId, link, input.actorId);

    if (list.state === "REVIEWED") {
      const key = supplierItemKey(lockedRow.row);
      const [item] = await tx.lockSupplierItems(list.supplierId, [key]);
      if (item) {
        await tx.rememberSupplierItemLink(item.id, link);
      }
    }
    return { kind: "linked" };
  });
}
