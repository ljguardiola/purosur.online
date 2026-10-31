import type { NetContentUnit, SaleUnit } from "../../catalog/index.js";
import { isMovementQuantity } from "../../stock/index.js";
import {
  mayCreateProductFromRow,
  maySupplierPriceListRowBeLinked,
} from "../model/supplier-price-list.js";
import type {
  CreateCatalogProductOutcome,
  SupplierItemProductStore,
} from "./supplier-item-product-store.js";
import { decideRowVatRate, linkRowAndRememberItem } from "./supplier-price-list-row-link-steps.js";

export interface CreateProductFromSupplierItemInput {
  listId: string;
  rowId: string;
  version: number;
  name: string;
  saleUnit: SaleUnit;
  categoryId: string;
  brandId: string | null;
  barcodes: string[];
  tagIds: string[];
  netContent: { quantity: number; unit: NetContentUnit } | null;
  // In thousandths of `saleUnit`.
  quantity: number;
  // In basis points; null when none was chosen.
  vatRate: number | null;
  actorId: string;
}

export type CreateProductFromSupplierItemOutcome =
  | { kind: "not_found" }
  | { kind: "not_editable" }
  | { kind: "stale_version" }
  | { kind: "already_linked" }
  | { kind: "invalid_quantity" }
  | { kind: "vat_rate_missing" }
  | { kind: "vat_rate_invalid" }
  | Exclude<CreateCatalogProductOutcome, { kind: "created" }>
  | { kind: "created"; productId: string };

export function createProductFromSupplierItem(
  store: SupplierItemProductStore,
  input: CreateProductFromSupplierItemInput,
): Promise<CreateProductFromSupplierItemOutcome> {
  return store.transaction<CreateProductFromSupplierItemOutcome>(async (tx) => {
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
    const { row } = lockedRow;
    if (!mayCreateProductFromRow(row)) {
      return { kind: "already_linked" };
    }
    if (!isMovementQuantity(input.saleUnit, input.quantity)) {
      return { kind: "invalid_quantity" };
    }
    const decision = decideRowVatRate(list.pricesIncludeVat, input.vatRate);
    if (decision.kind === "refused") {
      return { kind: decision.refusal };
    }

    const product = await tx.createCatalogProduct({
      name: input.name,
      categoryId: input.categoryId,
      brandId: input.brandId,
      saleUnit: input.saleUnit,
      barcodes: input.barcodes,
      tagIds: input.tagIds,
      netContent: input.netContent,
    });
    if (product.kind !== "created") {
      return product;
    }
    await linkRowAndRememberItem(
      tx,
      { list, listId: input.listId, rowId: input.rowId, row },
      {
        productId: product.productId,
        quantity: input.quantity,
        saleUnit: input.saleUnit,
        vatRate: decision.vatRate,
        relinkRequired: false,
      },
      input.actorId,
    );
    return { kind: "created", productId: product.productId };
  });
}
