import type { CashMovementType } from "../../register/index.js";
import type { ManualAdjustment } from "./manual-adjustment.js";
import type { SaleDiscount } from "./sale-discount.js";
import { saleUnitOfWeightSource, soldLineStockDelta } from "./sale-line.js";
import type { WeightSource } from "./weight-source.js";

export interface CompletedSaleLine {
  id: string;
  productId: string;
  productName: string;
  weightSource: WeightSource | null;
  manualAdjustment: ManualAdjustment | null;
  quantity: number;
  listUnitPrice: number;
  priceListId: string;
  promotionId: string | null;
  discountAmount: number;
  saleDiscountShare: number;
  lineTotal: number;
}

export interface CompletedSalePayment {
  id: string;
  method: "CASH" | "TRANSFER" | "QR";
  provider: string;
  amount: number;
  tendered: number | null;
  state: string;
  occurredAt: Date;
  authorizedBy: string | null;
  confirmedAt: Date | null;
}

export interface CompletedSaleCashMovement {
  id: string;
  type: CashMovementType;
  amount: number;
  actorId: string;
  occurredAt: Date;
}

interface CompletedSaleStockMovement {
  id: string;
  saleLineId: string;
  productId: string;
  delta: number;
}

export interface CompletedSale {
  id: string;
  sessionId: string;
  actorId: string;
  completedAt: Date;
  operationNumber: number | null;
  total: number;
  saleDiscount: SaleDiscount | null;
  saleDiscountAmount: number;
  lines: CompletedSaleLine[];
  payments: CompletedSalePayment[];
  cashMovements: CompletedSaleCashMovement[];
  stockMovements: CompletedSaleStockMovement[] | null;
}

export function stockMovementsMatchLines(
  lines: readonly CompletedSaleLine[],
  movements: readonly CompletedSaleStockMovement[],
): boolean {
  return (
    movements.length === lines.length &&
    lines.every(
      (line) =>
        movements.filter(
          (movement) =>
            movement.saleLineId === line.id &&
            movement.productId === line.productId &&
            movement.delta ===
              soldLineStockDelta({
                quantity: line.quantity,
                saleUnit: saleUnitOfWeightSource(line.weightSource),
              }),
        ).length === 1,
    )
  );
}
