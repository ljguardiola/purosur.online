import { type RebuiltPaidOrderStanding, rebuiltPaidOrderStanding } from "../../payments/index.js";
import { type OpenSaleStanding, openSaleStanding } from "../model/open-sale-standing.js";
import type { SaleWithLines } from "../model/sale.js";
import { amountToCharge } from "../model/sale-discount.js";
import type { SaleLedgerTransaction } from "./sale-ledger.js";

export type OpenSaleAnswerStanding = OpenSaleStanding & {
  rebuiltPaidOrder: RebuiltPaidOrderStanding | null;
};

export function openSaleStandingOf(
  tx: SaleLedgerTransaction,
  sale: SaleWithLines,
  now: Date,
): OpenSaleAnswerStanding {
  const payments = tx.salePayments(sale.id);
  return {
    ...openSaleStanding(
      amountToCharge(sale),
      payments,
      tx.pendingMercadoPagoPaymentsOf(sale.id),
      now,
    ),
    rebuiltPaidOrder: rebuiltPaidOrderStanding(tx.paidOrderOfSale(sale.id), payments),
  };
}
