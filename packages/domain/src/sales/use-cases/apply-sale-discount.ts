import type { ChargeRefusal } from "../../fiscal/index.js";
import type { Clock, OperationAuthority } from "../../shared/index.js";
import { type OpenSaleStanding, openSaleStanding } from "../model/open-sale-standing.js";
import type { SaleWithLines } from "../model/sale.js";
import {
  amountToCharge,
  type SaleDiscount,
  type SaleDiscountRefusal,
  type SaleDiscountValue,
  saleDiscountAmount,
  saleDiscountRefusal,
} from "../model/sale-discount.js";
import { saleTotal } from "../model/sale-line.js";
import { saleChargeRefusal } from "./sale-charge-refusal.js";
import type { SaleLedger } from "./sale-ledger.js";
import {
  isSaleLineChangeRefusal,
  type SaleLineChangeRefusal,
  saleToChange,
} from "./sale-line-change.js";

export interface ApplySaleDiscountInput {
  discount: SaleDiscountValue;
  reason: string;
}

export interface ApplySaleDiscountGrant {
  actorId: string;
  authorizedBy: string | undefined;
}

export interface ApplySaleDiscountPorts<Grant extends ApplySaleDiscountGrant, Refusal> {
  ledger: SaleLedger;
  clock: Clock;
  authority: OperationAuthority<Grant, Refusal>;
}

export type ApplySaleDiscountOutcome =
  | SaleLineChangeRefusal
  | SaleDiscountRefusal
  | ({
      kind: "applied";
      sale: SaleWithLines;
      saleDiscountAmount: number;
      chargeRefusal: ChargeRefusal | undefined;
    } & OpenSaleStanding);

export async function applySaleDiscount<Grant extends ApplySaleDiscountGrant, Refusal>(
  { ledger, clock, authority }: ApplySaleDiscountPorts<Grant, Refusal>,
  { discount, reason }: ApplySaleDiscountInput,
): Promise<ApplySaleDiscountOutcome | Refusal> {
  const authorization = await authority.authorize();
  if (authorization.kind === "refused") {
    return authorization.refusal;
  }
  const { actorId, authorizedBy } = authorization.grant;

  return ledger.transaction<ApplySaleDiscountOutcome>((tx) => {
    const sale = saleToChange(tx, actorId, clock);
    if (isSaleLineChangeRefusal(sale)) {
      return sale;
    }
    const refusal = saleDiscountRefusal(sale.lines, discount);
    if (refusal) {
      return refusal;
    }

    const saleDiscount: SaleDiscount = { ...discount, reason, authorizedBy: authorizedBy ?? null };
    tx.recordSaleDiscount(sale.id, saleDiscount);
    const discounted = { ...sale, saleDiscount };
    const moment = clock.now();
    return {
      kind: "applied",
      sale: discounted,
      saleDiscountAmount: saleDiscountAmount(saleTotal(sale.lines), discount),
      chargeRefusal: saleChargeRefusal(tx, discounted, moment),
      ...openSaleStanding(
        amountToCharge(discounted),
        tx.salePayments(sale.id),
        tx.pendingQrPaymentsOf(sale.id),
        moment,
      ),
    };
  });
}
