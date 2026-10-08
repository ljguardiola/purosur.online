import type { CashMovementType } from "../../register/index.js";
import { saleBalance } from "./sale-balance.js";

interface CompletedSaleLine {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  listUnitPrice: number;
  priceListId: string;
  promotionId: string | null;
  discountAmount: number;
  lineTotal: number;
}

export interface CompletedSalePayment {
  id: string;
  method: "CASH" | "TRANSFER";
  provider: string;
  amount: number;
  tendered: number | null;
  state: string;
  occurredAt: Date;
  authorizedBy: string | null;
  confirmedAt: Date | null;
}

interface CompletedSaleCashMovement {
  id: string;
  type: CashMovementType;
  amount: number;
  actorId: string;
  occurredAt: Date;
}

export interface CompletedSale {
  id: string;
  sessionId: string;
  actorId: string;
  completedAt: Date;
  total: number;
  lines: CompletedSaleLine[];
  payments: CompletedSalePayment[];
  cashMovements: CompletedSaleCashMovement[];
}

export function approvedPaymentsCoverTotal(sale: {
  total: number;
  payments: readonly { amount: number; state: string }[];
}): boolean {
  return saleBalance(sale.total, sale.payments).pending <= 0;
}
