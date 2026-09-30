import { argentinaCalendarDay } from "../../shared/index.js";
import type { DiscountBenefit } from "../model/discount-benefit.js";
import { isBuyNPayMSaleUnit } from "../model/discount-buy-n-pay-m.js";
import { isDiscountLive } from "../model/discount-status.js";
import type { DiscountTarget } from "../model/discount-target.js";
import { normalizeDiscountWeekdays } from "../model/discount-weekdays.js";
import type { EditDiscountPorts } from "./discount-store.js";
import { refuseUnfitTarget, type UnfitTargetOutcome } from "./refuse-unfit-target.js";

export interface EditDiscountInput {
  id: string;
  version: number;
  name: string;
  benefit: DiscountBenefit;
  target: DiscountTarget;
  validFrom: string;
  validTo: string;
  weekdays: number[];
  active: boolean;
}

export type EditDiscountOutcome =
  | { kind: "not_found" }
  | { kind: "stale_version" }
  | UnfitTargetOutcome
  | { kind: "product_sold_by_weight"; productName: string }
  | { kind: "applied"; version: number };

export async function editDiscount(
  { store, clock }: EditDiscountPorts,
  { id, version, ...fields }: EditDiscountInput,
): Promise<EditDiscountOutcome> {
  return store.transaction<EditDiscountOutcome>(async (tx) => {
    // Locks this one row so a concurrent edit of the same discount waits instead of racing.
    const locked = await tx.lockDiscount(id);
    if (locked.kind === "not_found") {
      return { kind: "not_found" };
    }
    if (locked.discount.version !== version) {
      return { kind: "stale_version" };
    }

    const targetChanged =
      locked.discount.target.kind !== fields.target.kind ||
      locked.discount.target.id !== fields.target.id;
    const becomesBuyNPayM =
      fields.benefit.kind === "BUY_N_PAY_M" && locked.discount.benefit.kind !== "BUY_N_PAY_M";
    const today = argentinaCalendarDay(clock.now());
    const becomesLiveBuyNPayM =
      fields.benefit.kind === "BUY_N_PAY_M" &&
      isDiscountLive(fields, today) &&
      !isDiscountLive(locked.discount, today);
    if (targetChanged || becomesBuyNPayM) {
      const refused = await refuseUnfitTarget(tx, fields.target, fields.benefit);
      if (refused) {
        return refused;
      }
    } else if (becomesLiveBuyNPayM && fields.target.kind === "PRODUCT") {
      // Discount row first, then the product's shared lock. A product edit holds the product row
      // and only reads discounts without locking them, so the two never wait on each other in
      // opposite orders.
      const product = await tx.lockDiscountedProduct(fields.target.id);
      if (product.kind === "locked" && !isBuyNPayMSaleUnit(product.saleUnit)) {
        return { kind: "product_sold_by_weight", productName: product.name };
      }
    }

    const nextVersion = version + 1;
    await tx.updateDiscount(id, {
      ...fields,
      weekdays: normalizeDiscountWeekdays(fields.weekdays),
      version: nextVersion,
    });

    return { kind: "applied", version: nextVersion };
  });
}
