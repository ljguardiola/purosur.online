import { isProductNameTooLong, type SaleUnit } from "../../catalog/index.js";
import { isPackagingNameTooLong, isQuantityPerPackage } from "../model/packaging.js";
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
  saleUnit: SaleUnit;
  categoryId: string;
  barcodes: string[];
  // Names the presentation only for an item whose list states none.
  packagingName: string | null;
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
  | { kind: "presentation_missing" }
  | { kind: "name_too_long" }
  | { kind: "presentation_too_long" }
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
    const { row } = lockedRow;
    if (!mayCreateProductFromRow(row)) {
      return { kind: "already_linked" };
    }
    const packagingName = row.presentation ?? input.packagingName;
    if (packagingName === null) {
      return { kind: "presentation_missing" };
    }
    if (isProductNameTooLong(row.description)) {
      return { kind: "name_too_long" };
    }
    if (isPackagingNameTooLong(packagingName)) {
      return { kind: "presentation_too_long" };
    }

    if (!isQuantityPerPackage(input.saleUnit, input.quantityPerPackage)) {
      return { kind: "invalid_quantity" };
    }
    const decision = decideRowVatRate(list.pricesIncludeVat, input.vatRate);
    if (decision.kind === "refused") {
      return { kind: decision.refusal };
    }

    const product = await tx.createCatalogProduct({
      name: row.description,
      categoryId: input.categoryId,
      saleUnit: input.saleUnit,
      barcodes: input.barcodes,
    });
    if (product.kind !== "created") {
      return product;
    }
    const packaging = await tx.insertPackaging({
      productId: product.productId,
      name: packagingName,
      quantityPerPackage: input.quantityPerPackage,
      saleUnit: input.saleUnit,
      actorId: input.actorId,
    });

    await linkRowAndRememberItem(
      tx,
      { list, listId: input.listId, rowId: input.rowId, row },
      { productId: product.productId, packagingId: packaging.id, vatRate: decision.vatRate },
      input.actorId,
    );
    return { kind: "created", productId: product.productId, packagingId: packaging.id };
  });
}
