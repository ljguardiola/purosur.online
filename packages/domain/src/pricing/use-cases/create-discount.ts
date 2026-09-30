import type { DiscountBenefit } from "../model/discount-benefit.js";
import type { DiscountTarget } from "../model/discount-target.js";
import { normalizeDiscountWeekdays } from "../model/discount-weekdays.js";
import type { DiscountPorts } from "./discount-store.js";
import { refuseUnfitTarget, type UnfitTargetOutcome } from "./refuse-unfit-target.js";

export interface CreateDiscountInput {
  name: string;
  benefit: DiscountBenefit;
  target: DiscountTarget;
  validFrom: string;
  validTo: string;
  weekdays: number[];
}

export type CreateDiscountOutcome = UnfitTargetOutcome | { kind: "created"; id: string };

export async function createDiscount(
  { store }: DiscountPorts,
  input: CreateDiscountInput,
): Promise<CreateDiscountOutcome> {
  return store.transaction<CreateDiscountOutcome>(async (tx) => {
    const refused = await refuseUnfitTarget(tx, input.target, input.benefit);
    if (refused) {
      return refused;
    }

    const created = await tx.insertDiscount({
      ...input,
      weekdays: normalizeDiscountWeekdays(input.weekdays),
      active: true,
      version: 1,
    });

    return { kind: "created", id: created.id };
  });
}
