import type { Clock, ZoneRulesSource } from "../../shared/index.js";
import { isMovementQuantity } from "../../stock/index.js";
import {
  hasPurchaseLines,
  isPurchaseDateInFuture,
  mayBePurchased,
  mayBePurchasedFrom,
  type ReceiptType,
} from "../model/purchase.js";
import { ONE_SALE_UNIT_QUANTITY, packagedQuantity } from "../model/purchase-line.js";
import type { LockProductResult, PurchasingStore } from "./purchasing-store.js";

interface PurchaseLineBase {
  productId: string;
  costPaidCents: number;
  lotNumber: string | null;
  expiresOn: string | null;
}

export type RegisterPurchaseLine = PurchaseLineBase &
  (
    | { loadedBy: "packages"; packages: number; quantityPerPackage: number }
    | { loadedBy: "quantity"; quantity: number }
  );

export interface RegisterPurchaseInput {
  supplierId: string;
  purchasedOn: string;
  receiptType: ReceiptType;
  receiptNumber: string | null;
  note: string | null;
  lines: readonly RegisterPurchaseLine[];
  actorId: string;
  locationId: string;
}

export interface RegisterPurchasePorts {
  store: PurchasingStore;
  clock: Clock;
  zoneRules: ZoneRulesSource;
}

export interface RegisteredPurchaseLine {
  id: string;
  productId: string;
  packages: number | null;
  quantity: number;
  costPaidCents: number;
  quantityPerPackage: number;
  lotNumber: string | null;
  expiresOn: string | null;
}

export interface RegisteredPurchase {
  id: string;
  supplierId: string;
  locationId: string;
  purchasedOn: string;
  receiptType: ReceiptType;
  receiptNumber: string | null;
  note: string | null;
  recordedAt: Date;
  lines: RegisteredPurchaseLine[];
}

export type RegisterPurchaseOutcome =
  | { kind: "no_lines" }
  | { kind: "date_in_future" }
  | { kind: "supplier_not_found" }
  | { kind: "supplier_inactive" }
  | { kind: "product_not_found"; lineIndex: number }
  | { kind: "product_inactive"; lineIndex: number }
  | { kind: "invalid_quantity"; lineIndex: number }
  | { kind: "registered"; purchase: RegisteredPurchase };

type LockedProduct = Extract<LockProductResult, { kind: "locked" }>["product"];
type LineRefusal = Exclude<RegisterPurchaseOutcome, { kind: "registered" }>;

interface ResolvedLine {
  line: RegisterPurchaseLine;
  packages: number | null;
  quantity: number;
  quantityPerPackage: number;
}

function sortedDistinct(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

function resolveLine(
  line: RegisterPurchaseLine,
  lineIndex: number,
  product: LockedProduct,
): ResolvedLine | LineRefusal {
  if (line.loadedBy === "quantity") {
    if (!isMovementQuantity(product.saleUnit, line.quantity)) {
      return { kind: "invalid_quantity", lineIndex };
    }
    return {
      line,
      packages: null,
      quantity: line.quantity,
      quantityPerPackage: ONE_SALE_UNIT_QUANTITY,
    };
  }

  if (!isMovementQuantity(product.saleUnit, line.quantityPerPackage)) {
    return { kind: "invalid_quantity", lineIndex };
  }
  const quantity = packagedQuantity(line.packages, line.quantityPerPackage);
  if (!isMovementQuantity(product.saleUnit, quantity)) {
    return { kind: "invalid_quantity", lineIndex };
  }
  return {
    line,
    packages: line.packages,
    quantity,
    quantityPerPackage: line.quantityPerPackage,
  };
}

export async function registerPurchase(
  { store, clock, zoneRules }: RegisterPurchasePorts,
  input: RegisterPurchaseInput,
): Promise<RegisterPurchaseOutcome> {
  if (!hasPurchaseLines(input.lines.length)) {
    return { kind: "no_lines" };
  }
  const recordedAt = clock.now();
  if (isPurchaseDateInFuture(input.purchasedOn, recordedAt, zoneRules.zoneRules())) {
    return { kind: "date_in_future" };
  }

  return store.transaction<RegisterPurchaseOutcome>(async (tx) => {
    const supplier = await tx.lockSupplier(input.supplierId);
    if (supplier.kind === "not_found") {
      return { kind: "supplier_not_found" };
    }
    if (!mayBePurchasedFrom(supplier.supplier)) {
      return { kind: "supplier_inactive" };
    }

    const products = new Map<string, LockProductResult>();
    for (const productId of sortedDistinct(input.lines.map((line) => line.productId))) {
      products.set(productId, await tx.holdPurchasedProduct(productId));
    }
    const lockedProducts: LockedProduct[] = [];
    for (const [lineIndex, line] of input.lines.entries()) {
      const locked = products.get(line.productId);
      if (!locked || locked.kind === "not_found") {
        return { kind: "product_not_found", lineIndex };
      }
      if (!mayBePurchased(locked.product)) {
        return { kind: "product_inactive", lineIndex };
      }
      lockedProducts.push(locked.product);
    }

    const resolved: ResolvedLine[] = [];
    for (const [lineIndex, line] of input.lines.entries()) {
      const product = lockedProducts[lineIndex] as LockedProduct;
      const result = resolveLine(line, lineIndex, product);
      if ("kind" in result) {
        return result;
      }
      resolved.push(result);
    }

    const { id: purchaseId } = await tx.insertPurchase({
      supplierId: input.supplierId,
      locationId: input.locationId,
      purchasedOn: input.purchasedOn,
      receiptType: input.receiptType,
      receiptNumber: input.receiptNumber,
      note: input.note,
      recordedAt,
      actorId: input.actorId,
    });

    const lines: RegisteredPurchaseLine[] = [];
    for (const [index, resolvedLine] of resolved.entries()) {
      const { line, packages, quantity, quantityPerPackage } = resolvedLine;
      const registered = {
        productId: line.productId,
        packages,
        quantity,
        costPaidCents: line.costPaidCents,
        quantityPerPackage,
        lotNumber: line.lotNumber,
        expiresOn: line.expiresOn,
      };
      const { id } = await tx.insertPurchaseLine({
        purchaseId,
        position: index + 1,
        ...registered,
      });

      lines.push({ id, ...registered });
    }

    await tx.postponePriceReviews({
      locationId: input.locationId,
      purchaseId,
      actorId: input.actorId,
      postponedAt: recordedAt,
      productIds: sortedDistinct(input.lines.map((line) => line.productId)),
    });

    await tx.receiveStock({
      locationId: input.locationId,
      occurredAt: recordedAt,
      purchasedOn: input.purchasedOn,
      actorId: input.actorId,
      lines: lines.map(
        ({ id, productId, quantity, costPaidCents, quantityPerPackage, lotNumber, expiresOn }) => ({
          purchaseLineId: id,
          productId,
          quantity,
          costPaidCents,
          quantityPerPackage,
          lotNumber,
          expiresOn,
        }),
      ),
    });

    return {
      kind: "registered",
      purchase: {
        id: purchaseId,
        supplierId: input.supplierId,
        locationId: input.locationId,
        purchasedOn: input.purchasedOn,
        receiptType: input.receiptType,
        receiptNumber: input.receiptNumber,
        note: input.note,
        recordedAt,
        lines,
      },
    };
  });
}
