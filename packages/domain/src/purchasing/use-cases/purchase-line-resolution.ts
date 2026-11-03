import { isMovementQuantity } from "../../stock/index.js";
import { mayBePurchased } from "../model/purchase.js";
import { ONE_SALE_UNIT_QUANTITY, packagedQuantity } from "../model/purchase-line.js";
import type { LockProductResult, PurchasingStoreTransaction } from "./purchasing-store.js";

interface PurchaseLineBase {
  productId: string;
  costPaidCents: number;
  expiresOn: string | null;
}

export type RegisterPurchaseLine = PurchaseLineBase &
  (
    | { loadedBy: "packages"; packages: number; quantityPerPackage: number }
    | { loadedBy: "quantity"; quantity: number }
  );

export interface ResolvedLine {
  line: RegisterPurchaseLine;
  packages: number | null;
  quantity: number;
  quantityPerPackage: number;
}

export type LineRefusal =
  | { kind: "product_not_found"; lineIndex: number }
  | { kind: "product_inactive"; lineIndex: number }
  | { kind: "invalid_quantity"; lineIndex: number };

type LineStoreTransaction = Pick<
  PurchasingStoreTransaction,
  "holdPurchasedProduct" | "insertPurchaseLine" | "postponePriceReviews" | "receiveStock"
>;

type LockedProduct = Extract<LockProductResult, { kind: "locked" }>["product"];

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

export async function holdAndResolveLines(
  tx: LineStoreTransaction,
  lines: readonly RegisterPurchaseLine[],
): Promise<{ kind: "resolved"; lines: ResolvedLine[] } | LineRefusal> {
  const products = new Map<string, LockProductResult>();
  for (const productId of sortedDistinct(lines.map((line) => line.productId))) {
    products.set(productId, await tx.holdPurchasedProduct(productId));
  }
  const lockedProducts: LockedProduct[] = [];
  for (const [lineIndex, line] of lines.entries()) {
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
  for (const [lineIndex, line] of lines.entries()) {
    const result = resolveLine(line, lineIndex, lockedProducts[lineIndex] as LockedProduct);
    if ("kind" in result) {
      return result;
    }
    resolved.push(result);
  }
  return { kind: "resolved", lines: resolved };
}

export interface RegisteredPurchaseLine {
  id: string;
  productId: string;
  packages: number | null;
  quantity: number;
  costPaidCents: number;
  quantityPerPackage: number;
  expiresOn: string | null;
}

export interface RecordPurchaseLines {
  purchaseId: string;
  locationId: string;
  actorId: string;
  recordedAt: Date;
  purchasedOn: string;
  firstPosition: number;
  resolved: readonly ResolvedLine[];
}

export async function recordPurchaseLines(
  tx: LineStoreTransaction,
  recording: RecordPurchaseLines,
): Promise<RegisteredPurchaseLine[]> {
  const { purchaseId, locationId, actorId, recordedAt, purchasedOn, firstPosition, resolved } =
    recording;
  const lines: RegisteredPurchaseLine[] = [];
  for (const [index, resolvedLine] of resolved.entries()) {
    const { line, packages, quantity, quantityPerPackage } = resolvedLine;
    const registered = {
      productId: line.productId,
      packages,
      quantity,
      costPaidCents: line.costPaidCents,
      quantityPerPackage,
      expiresOn: line.expiresOn,
    };
    const { id } = await tx.insertPurchaseLine({
      purchaseId,
      position: firstPosition + index,
      ...registered,
    });
    lines.push({ id, ...registered });
  }

  await tx.postponePriceReviews({
    locationId,
    purchaseId,
    actorId,
    postponedAt: recordedAt,
    productIds: sortedDistinct(resolved.map(({ line }) => line.productId)),
  });

  await tx.receiveStock({
    locationId,
    occurredAt: recordedAt,
    purchasedOn,
    actorId,
    lines: lines.map(
      ({ id, productId, quantity, costPaidCents, quantityPerPackage, expiresOn }) => ({
        purchaseLineId: id,
        productId,
        quantity,
        costPaidCents,
        quantityPerPackage,
        expiresOn,
      }),
    ),
  });
  return lines;
}
