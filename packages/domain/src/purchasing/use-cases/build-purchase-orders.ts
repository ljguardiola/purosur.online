import type { SaleUnit } from "../../catalog/index.js";
import type { Clock } from "../../shared/index.js";
import { isMovementQuantity } from "../../stock/index.js";
import { mayBePurchased, mayBePurchasedFrom } from "../model/purchase.js";
import { isPackageCount, packagedQuantity } from "../model/purchase-line.js";
import { supplierOfferToOrder } from "../model/supplier-offer.js";
import type { PurchaseOrderLineFields, PurchaseOrderStore } from "./purchase-order-store.js";

export interface PurchaseOrderChoice {
  productId: string;
  supplierId: string;
  packages: number;
}

export interface BuildPurchaseOrdersInput {
  locationId: string;
  actorId: string;
  choices: readonly PurchaseOrderChoice[];
}

export interface BuildPurchaseOrdersPorts {
  store: PurchaseOrderStore;
  clock: Clock;
}

export type BuildPurchaseOrdersOutcome =
  | { kind: "created"; orderIds: string[] }
  | { kind: "no_choices" }
  | { kind: "invalid_package_count" }
  | { kind: "duplicate_product"; productId: string }
  | { kind: "supplier_not_purchasable"; supplierId: string }
  | { kind: "product_not_purchasable"; productId: string }
  | { kind: "offer_unavailable"; productId: string; supplierId: string };

function sortedDistinct(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

export async function buildPurchaseOrders(
  { store, clock }: BuildPurchaseOrdersPorts,
  input: BuildPurchaseOrdersInput,
): Promise<BuildPurchaseOrdersOutcome> {
  if (input.choices.length === 0) {
    return { kind: "no_choices" };
  }
  if (!input.choices.every((choice) => isPackageCount(choice.packages))) {
    return { kind: "invalid_package_count" };
  }
  const seen = new Set<string>();
  for (const { productId, supplierId } of input.choices) {
    const key = JSON.stringify([supplierId, productId]);
    if (seen.has(key)) {
      return { kind: "duplicate_product", productId };
    }
    seen.add(key);
  }

  const createdAt = clock.now();
  return store.transaction<BuildPurchaseOrdersOutcome>(async (tx) => {
    const supplierIds = sortedDistinct(input.choices.map((choice) => choice.supplierId));
    for (const supplierId of supplierIds) {
      const supplier = await tx.lockSupplier(supplierId);
      if (supplier.kind === "not_found" || !mayBePurchasedFrom(supplier.supplier)) {
        return { kind: "supplier_not_purchasable", supplierId };
      }
    }

    const products = new Map<string, { saleUnit: SaleUnit }>();
    for (const productId of sortedDistinct(input.choices.map((choice) => choice.productId))) {
      const product = await tx.holdPurchasedProduct(productId);
      if (product.kind === "not_found" || !mayBePurchased(product.product)) {
        return { kind: "product_not_purchasable", productId };
      }
      products.set(productId, product.product);
    }

    const linesBySupplier = new Map<string, PurchaseOrderLineFields[]>();
    for (const { productId, supplierId, packages } of input.choices) {
      const { saleUnit } = products.get(productId) as { saleUnit: SaleUnit };
      const offer = supplierOfferToOrder(await tx.supplierOffers(supplierId, productId), saleUnit);
      if (!offer) {
        return { kind: "offer_unavailable", productId, supplierId };
      }
      if (!isMovementQuantity(saleUnit, packagedQuantity(packages, offer.link.quantity))) {
        return { kind: "invalid_package_count" };
      }
      const lines = linesBySupplier.get(supplierId) ?? [];
      lines.push({
        productId,
        packages,
        quantityPerPackage: offer.link.quantity,
        expectedPackagePriceCents: offer.priceCents,
      });
      linesBySupplier.set(supplierId, lines);
    }

    const orderIds: string[] = [];
    for (const supplierId of supplierIds) {
      const { id } = await tx.insertDraftPurchaseOrder({
        supplierId,
        locationId: input.locationId,
        createdAt,
        actorId: input.actorId,
      });
      for (const [index, line] of (linesBySupplier.get(supplierId) ?? []).entries()) {
        await tx.insertPurchaseOrderLine({ purchaseOrderId: id, position: index + 1, ...line });
      }
      orderIds.push(id);
    }
    return { kind: "created", orderIds };
  });
}
