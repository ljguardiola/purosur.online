import type { SaleUnit } from "../../catalog/index.js";
import { isMovementQuantity } from "../../stock/index.js";
import { mayBePurchased } from "../model/purchase.js";
import { isPackageCount, packagedQuantity } from "../model/purchase-line.js";
import { mayBeEdited } from "../model/purchase-order.js";
import { supplierOfferToOrder } from "../model/supplier-offer.js";
import type { PurchaseOrderLineFields, PurchaseOrderStore } from "./purchase-order-store.js";

export interface EditedPurchaseOrderLine {
  productId: string;
  packages: number;
  quantityPerPackage: number;
}

export interface EditPurchaseOrderInput {
  locationId: string;
  orderId: string;
  lines: readonly EditedPurchaseOrderLine[];
}

export interface EditPurchaseOrderPorts {
  store: PurchaseOrderStore;
}

export type EditPurchaseOrderOutcome =
  | { kind: "edited" }
  | { kind: "not_found" }
  | { kind: "not_editable" }
  | { kind: "no_lines" }
  | { kind: "invalid_package_count" }
  | { kind: "invalid_quantity_per_package" }
  | { kind: "duplicate_product"; productId: string }
  | { kind: "product_not_purchasable"; productId: string };

export async function editPurchaseOrder(
  { store }: EditPurchaseOrderPorts,
  input: EditPurchaseOrderInput,
): Promise<EditPurchaseOrderOutcome> {
  if (input.lines.length === 0) {
    return { kind: "no_lines" };
  }
  if (!input.lines.every((line) => isPackageCount(line.packages))) {
    return { kind: "invalid_package_count" };
  }
  const productIds = new Set<string>();
  for (const { productId } of input.lines) {
    if (productIds.has(productId)) {
      return { kind: "duplicate_product", productId };
    }
    productIds.add(productId);
  }

  return store.transaction<EditPurchaseOrderOutcome>(async (tx) => {
    const locked = await tx.lockPurchaseOrder(input.locationId, input.orderId);
    if (locked.kind === "not_found") {
      return { kind: "not_found" };
    }
    const { order } = locked;
    if (!mayBeEdited(order.state)) {
      return { kind: "not_editable" };
    }

    const products = new Map<string, { saleUnit: SaleUnit }>();
    for (const productId of [...productIds].sort()) {
      const product = await tx.holdPurchasedProduct(productId);
      if (product.kind === "not_found" || !mayBePurchased(product.product)) {
        return { kind: "product_not_purchasable", productId };
      }
      products.set(productId, product.product);
    }

    const keptPrices = new Map(
      order.lines.map((line) => [line.productId, line.expectedPackagePriceCents]),
    );
    const lines: PurchaseOrderLineFields[] = [];
    for (const { productId, packages, quantityPerPackage } of input.lines) {
      const { saleUnit } = products.get(productId) as { saleUnit: SaleUnit };
      if (!isMovementQuantity(saleUnit, quantityPerPackage)) {
        return { kind: "invalid_quantity_per_package" };
      }
      if (!isMovementQuantity(saleUnit, packagedQuantity(packages, quantityPerPackage))) {
        return { kind: "invalid_package_count" };
      }
      let expectedPackagePriceCents = keptPrices.get(productId) ?? null;
      if (!keptPrices.has(productId)) {
        const offer = supplierOfferToOrder(
          await tx.supplierOffers(order.supplierId, productId),
          saleUnit,
        );
        expectedPackagePriceCents = offer?.priceCents ?? null;
      }
      lines.push({ productId, packages, quantityPerPackage, expectedPackagePriceCents });
    }

    await tx.replacePurchaseOrderLines(order.id, lines);
    return { kind: "edited" };
  });
}
