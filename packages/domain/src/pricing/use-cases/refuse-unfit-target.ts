import type { DiscountBenefit } from "../model/discount-benefit.js";
import type { DiscountTarget } from "../model/discount-target.js";
import { isAssignableTarget, targetAcceptsBenefit } from "../model/discount-target-eligibility.js";
import type { DiscountStoreTransaction } from "./discount-store.js";

export type UnfitTargetOutcome = { kind: "target_not_found" } | { kind: "target_not_sold_by_unit" };

export async function refuseUnfitTarget(
  tx: DiscountStoreTransaction,
  target: DiscountTarget,
  benefit: DiscountBenefit,
): Promise<UnfitTargetOutcome | undefined> {
  // Locks the target so it cannot be deactivated or change how it is sold while the discount that
  // points at it is written.
  const locked = await tx.lockTarget(target);
  if (locked.kind === "not_found" || !isAssignableTarget(locked.target)) {
    return { kind: "target_not_found" };
  }
  if (!targetAcceptsBenefit(locked.target, benefit.kind)) {
    return { kind: "target_not_sold_by_unit" };
  }
  return undefined;
}
