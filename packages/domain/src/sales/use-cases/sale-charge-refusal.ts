import { type ChargeRefusal, chargeRefusal } from "../../fiscal/index.js";
import type { SaleWithLines } from "../model/sale.js";
import { saleTotal } from "../model/sale-line.js";
import type { SaleLedgerTransaction } from "./sale-ledger.js";

export function saleChargeRefusal(
  tx: SaleLedgerTransaction,
  sale: SaleWithLines,
  moment: Date,
): ChargeRefusal | undefined {
  return chargeRefusal(saleTotal(sale.lines), tx.buyerIdentificationThresholds(), moment);
}
