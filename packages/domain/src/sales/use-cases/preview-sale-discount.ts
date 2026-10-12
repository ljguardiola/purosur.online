import type { Clock } from "../../shared/index.js";
import {
  type SaleDiscountRefusal,
  type SaleDiscountValue,
  saleDiscountAmount,
  saleDiscountRefusal,
} from "../model/sale-discount.js";
import { saleTotal } from "../model/sale-line.js";
import type { SaleLedger } from "./sale-ledger.js";
import {
  isSaleLineChangeRefusal,
  type SaleLineChangeRefusal,
  saleToChange,
} from "./sale-line-change.js";

export interface PreviewSaleDiscountInput {
  actorId: string;
  discount: SaleDiscountValue;
}

export interface PreviewSaleDiscountPorts {
  ledger: SaleLedger;
  clock: Clock;
}

export type PreviewSaleDiscountOutcome =
  | SaleLineChangeRefusal
  | SaleDiscountRefusal
  | { kind: "preview"; subtotal: number; saleDiscountAmount: number; total: number };

export function previewSaleDiscount(
  { ledger, clock }: PreviewSaleDiscountPorts,
  { actorId, discount }: PreviewSaleDiscountInput,
): PreviewSaleDiscountOutcome {
  return ledger.transaction<PreviewSaleDiscountOutcome>((tx) => {
    const sale = saleToChange(tx, actorId, clock);
    if (isSaleLineChangeRefusal(sale)) {
      return sale;
    }
    const refusal = saleDiscountRefusal(sale.lines, discount);
    if (refusal) {
      return refusal;
    }
    const subtotal = saleTotal(sale.lines);
    const amount = saleDiscountAmount(subtotal, discount);
    return { kind: "preview", subtotal, saleDiscountAmount: amount, total: subtotal - amount };
  });
}
