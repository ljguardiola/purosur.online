import type { SaleUnit } from "../../catalog/index.js";
import { isQuantityPerPackage } from "../model/packaging.js";
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
  barcodes: string[];
  packagingName: string;
  quantityPerPackage: number;
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
  | { kind: "created"; productId: string; packagingId: string };

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
    if (!mayCreateProductFromRow(lockedRow.row)) {
      return { kind: "already_linked" };
    }

    if (!isQuantityPerPackage(input.saleUnit, input.quantityPerPackage)) {
      return { kind: "invalid_quantity" };
    }
    const decision = decideRowVatRate(list.pricesIncludeVat, input.vatRate);
    if (decision.kind === "refused") {
      return { kind: decision.refusal };
    }

    const product = await tx.createCatalogProduct({
      name: input.name,
      categoryId: input.categoryId,
      saleUnit: input.saleUnit,
      barcodes: input.barcodes,
    });
    if (product.kind !== "created") {
      return product;
    }
    const packaging = await tx.insertPackaging({
      productId: product.productId,
      name: input.packagingName,
      quantityPerPackage: input.quantityPerPackage,
      saleUnit: input.saleUnit,
      actorId: input.actorId,
    });

    await linkRowAndRememberItem(
      tx,
      { list, listId: input.listId, rowId: input.rowId, row: lockedRow.row },
      { productId: product.productId, packagingId: packaging.id, vatRate: decision.vatRate },
      input.actorId,
    );
    return { kind: "created", productId: product.productId, packagingId: packaging.id };
  });
}
