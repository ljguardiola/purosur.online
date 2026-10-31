import { isMovementQuantity } from "../../stock/index.js";
import { maySupplierPriceListRowBeLinked } from "../model/supplier-price-list.js";
import { decideRowVatRate, linkRowAndRememberItem } from "./supplier-price-list-row-link-steps.js";
import type { SupplierPriceListStore } from "./supplier-price-list-store.js";

export interface LinkSupplierPriceListRowInput {
  listId: string;
  rowId: string;
  version: number;
  productId: string;
  // In thousandths of the product's sale unit.
  quantity: number;
  // In basis points; null when none was chosen.
  vatRate: number | null;
  actorId: string;
}

export type LinkSupplierPriceListRowOutcome =
  | { kind: "not_found" }
  | { kind: "not_editable" }
  | { kind: "stale_version" }
  | { kind: "product_not_linkable" }
  | { kind: "invalid_quantity" }
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

    const target = await tx.lockLinkableProduct(input.productId);
    if (target.kind === "not_found" || !target.product.active) {
      return { kind: "product_not_linkable" };
    }
    if (!isMovementQuantity(target.product.saleUnit, input.quantity)) {
      return { kind: "invalid_quantity" };
    }

    const decision = decideRowVatRate(list.pricesIncludeVat, input.vatRate);
    if (decision.kind === "refused") {
      return { kind: decision.refusal };
    }

    await linkRowAndRememberItem(
      tx,
      { list, listId: input.listId, rowId: input.rowId, row: lockedRow.row },
      {
        productId: input.productId,
        quantity: input.quantity,
        saleUnit: target.product.saleUnit,
        vatRate: decision.vatRate,
        relinkRequired: false,
      },
      input.actorId,
    );
    return { kind: "linked" };
  });
}
