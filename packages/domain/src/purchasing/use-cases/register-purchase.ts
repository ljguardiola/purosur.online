import type { Clock } from "../../shared/index.js";
import {
  isMovementQuantity,
  lotOfPurchaseLine,
  movesBalance,
  receiptMovement,
} from "../../stock/index.js";
import { hasProductSaleUnitChanged } from "../model/packaging.js";
import { hasPurchaseLines, isPurchaseDateInFuture, type ReceiptType } from "../model/purchase.js";
import { ONE_SALE_UNIT_QUANTITY, packagedQuantity } from "../model/purchase-line.js";
import type {
  LockPackagingResult,
  LockProductResult,
  PurchasingStore,
} from "./purchasing-store.js";

interface PurchaseLineBase {
  productId: string;
  costPaidCents: number;
  lotNumber: string | null;
  expiresOn: string | null;
}

export type RegisterPurchaseLine = PurchaseLineBase &
  (
    | { loadedBy: "packaging"; packagingId: string; packages: number }
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
}

export interface RegisteredPurchaseLine {
  id: string;
  productId: string;
  packagingId: string | null;
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
  | { kind: "packaging_not_found"; lineIndex: number }
  | { kind: "packaging_inactive"; lineIndex: number }
  | { kind: "packaging_sale_unit_changed"; lineIndex: number }
  | { kind: "invalid_quantity"; lineIndex: number }
  | { kind: "registered"; purchase: RegisteredPurchase };

type LockedProduct = Extract<LockProductResult, { kind: "locked" }>["product"];
type LockedPackaging = Extract<LockPackagingResult, { kind: "locked" }>["packaging"];
type LineRefusal = Exclude<RegisterPurchaseOutcome, { kind: "registered" }>;

interface ResolvedLine {
  line: RegisterPurchaseLine;
  packagingId: string | null;
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
  packagings: ReadonlyMap<string, LockedPackaging | undefined>,
): ResolvedLine | LineRefusal {
  if (line.loadedBy === "quantity") {
    if (!isMovementQuantity(product.saleUnit, line.quantity)) {
      return { kind: "invalid_quantity", lineIndex };
    }
    return {
      line,
      packagingId: null,
      packages: null,
      quantity: line.quantity,
      quantityPerPackage: ONE_SALE_UNIT_QUANTITY,
    };
  }

  const packaging = packagings.get(line.packagingId);
  if (!packaging || packaging.productId !== line.productId) {
    return { kind: "packaging_not_found", lineIndex };
  }
  if (!packaging.active) {
    return { kind: "packaging_inactive", lineIndex };
  }
  if (hasProductSaleUnitChanged(packaging.saleUnit, product.saleUnit)) {
    return { kind: "packaging_sale_unit_changed", lineIndex };
  }
  const quantity = packagedQuantity(line.packages, packaging.quantityPerPackage);
  if (!isMovementQuantity(product.saleUnit, quantity)) {
    return { kind: "invalid_quantity", lineIndex };
  }
  return {
    line,
    packagingId: packaging.id,
    packages: line.packages,
    quantity,
    quantityPerPackage: packaging.quantityPerPackage,
  };
}

export async function registerPurchase(
  { store, clock }: RegisterPurchasePorts,
  input: RegisterPurchaseInput,
): Promise<RegisterPurchaseOutcome> {
  if (!hasPurchaseLines(input.lines.length)) {
    return { kind: "no_lines" };
  }
  const recordedAt = clock.now();
  if (isPurchaseDateInFuture(input.purchasedOn, recordedAt)) {
    return { kind: "date_in_future" };
  }

  return store.transaction<RegisterPurchaseOutcome>(async (tx) => {
    const supplier = await tx.lockSupplier(input.supplierId);
    if (supplier.kind === "not_found") {
      return { kind: "supplier_not_found" };
    }
    if (!supplier.supplier.active) {
      return { kind: "supplier_inactive" };
    }

    const products = new Map<string, LockProductResult>();
    for (const productId of sortedDistinct(input.lines.map((line) => line.productId))) {
      products.set(productId, await tx.lockProduct(productId));
    }
    const lockedProducts: LockedProduct[] = [];
    for (const [lineIndex, line] of input.lines.entries()) {
      const locked = products.get(line.productId);
      if (!locked || locked.kind === "not_found") {
        return { kind: "product_not_found", lineIndex };
      }
      if (!locked.product.active) {
        return { kind: "product_inactive", lineIndex };
      }
      lockedProducts.push(locked.product);
    }

    const packagings = new Map<string, LockedPackaging | undefined>();
    const packagingIds = input.lines.flatMap((line) =>
      line.loadedBy === "packaging" ? [line.packagingId] : [],
    );
    for (const packagingId of sortedDistinct(packagingIds)) {
      const locked = await tx.lockPackaging(packagingId);
      packagings.set(packagingId, locked.kind === "locked" ? locked.packaging : undefined);
    }
    const resolved: ResolvedLine[] = [];
    for (const [lineIndex, line] of input.lines.entries()) {
      const product = lockedProducts[lineIndex] as LockedProduct;
      const result = resolveLine(line, lineIndex, product, packagings);
      if ("kind" in result) {
        return result;
      }
      resolved.push(result);
    }

    for (const productId of sortedDistinct(input.lines.map((line) => line.productId))) {
      await tx.lockStockBalance({ productId, locationId: input.locationId });
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
    for (const { line, packagingId, packages, quantity, quantityPerPackage } of resolved) {
      const registered = {
        productId: line.productId,
        packagingId,
        packages,
        quantity,
        costPaidCents: line.costPaidCents,
        quantityPerPackage,
        lotNumber: line.lotNumber,
        expiresOn: line.expiresOn,
      };
      const { id } = await tx.insertPurchaseLine({ purchaseId, ...registered });

      const key = { productId: line.productId, locationId: input.locationId };
      const coveringCount = await tx.earliestCountAtOrAfter(key, recordedAt);
      const movement = receiptMovement(
        { ...key, quantity, occurredAt: recordedAt, actorId: input.actorId, purchaseLineId: id },
        coveringCount?.movementId ?? null,
      );
      await tx.recordReceiptMovement(movement);
      if (movesBalance(movement)) {
        await tx.addToStockBalance(key, quantity);
      }
      await tx.insertLot(lotOfPurchaseLine({ id, locationId: input.locationId, ...registered }));

      lines.push({ id, ...registered });
    }

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
