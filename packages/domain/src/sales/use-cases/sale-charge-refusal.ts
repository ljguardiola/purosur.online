import type { ChargeRefusal } from "../../fiscal/index.js";
import { buyerIdentificationRefusal } from "../model/buyer-identification-check.js";
import type { SaleWithLines } from "../model/sale.js";
import { saleTotal } from "../model/sale-line.js";
import type { SaleLedgerTransaction } from "./sale-ledger.js";

export function saleChargeRefusal(
  tx: SaleLedgerTransaction,
  sale: SaleWithLines,
  moment: Date,
): ChargeRefusal | undefined {
  return buyerIdentificationRefusal(
    saleTotal(sale.lines),
    tx.salePayments(sale.id),
    tx.buyerIdentificationThresholds(),
    moment,
  );
}
