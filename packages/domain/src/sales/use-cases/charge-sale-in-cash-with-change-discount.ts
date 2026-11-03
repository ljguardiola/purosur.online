import type { OperationAuthority } from "../../shared/index.js";
import { CHANGE_DISCOUNT_REASON, type SaleDiscountRefusal } from "../model/sale-discount.js";
import {
  type ApplySaleDiscountGrant,
  type ApplySaleDiscountRules,
  applySaleDiscountIn,
} from "./apply-sale-discount.js";
import { type ChargeSaleInCashOutcome, chargeSaleInCashIn } from "./charge-sale-in-cash.js";
import type { IdGenerator, SaleLedger } from "./sale-ledger.js";
import type { SaleLineChangeRefusal } from "./sale-line-change.js";

export interface ChargeSaleInCashWithChangeDiscountInput {
  saleId: string;
  tendered: number;
  discountAmount: number;
}

export interface ChargeSaleInCashWithChangeDiscountPorts<
  Grant extends ApplySaleDiscountGrant,
  Refusal,
> extends ApplySaleDiscountRules {
  ledger: SaleLedger;
  ids: IdGenerator;
  authority: OperationAuthority<Grant, Refusal>;
}

export type ChargeSaleInCashWithChangeDiscountOutcome =
  | SaleLineChangeRefusal
  | SaleDiscountRefusal
  | ChargeSaleInCashOutcome;

class ChargeRefused extends Error {
  readonly outcome: ChargeSaleInCashOutcome;

  constructor(outcome: ChargeSaleInCashOutcome) {
    super(outcome.kind);
    this.outcome = outcome;
  }
}

export async function chargeSaleInCashWithChangeDiscount<
  Grant extends ApplySaleDiscountGrant,
  Refusal,
>(
  {
    ledger,
    restoration,
    clock,
    zoneRules,
    ids,
    authority,
  }: ChargeSaleInCashWithChangeDiscountPorts<Grant, Refusal>,
  { saleId, tendered, discountAmount }: ChargeSaleInCashWithChangeDiscountInput,
): Promise<ChargeSaleInCashWithChangeDiscountOutcome | Refusal> {
  const authorization = await authority.authorize();
  if (authorization.kind === "refused") {
    return authorization.refusal;
  }
  const { actorId, authorizedBy } = authorization.grant;

  try {
    return ledger.transaction<ChargeSaleInCashWithChangeDiscountOutcome>((tx) => {
      const applied = applySaleDiscountIn(
        tx,
        { restoration, clock, zoneRules },
        {
          actorId,
          authorizedBy,
          discount: { kind: "AMOUNT", amount: discountAmount },
          reason: CHANGE_DISCOUNT_REASON,
        },
      );
      if (applied.kind !== "applied") {
        return applied;
      }
      const charged = chargeSaleInCashIn(
        tx,
        { restoration, clock, zoneRules, ids },
        { actorId, saleId, tendered },
      );
      if (charged.kind !== "completed" && charged.kind !== "partially_paid") {
        throw new ChargeRefused(charged);
      }
      return charged;
    });
  } catch (error) {
    if (error instanceof ChargeRefused) {
      return error.outcome;
    }
    throw error;
  }
}
