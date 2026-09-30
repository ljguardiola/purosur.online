import type { DiscountBenefit } from "../model/discount-benefit.js";
import type { DiscountTarget } from "../model/discount-target.js";
import { normalizeDiscountWeekdays } from "../model/discount-weekdays.js";
import type { DiscountPorts } from "./discount-store.js";

export interface CreateDiscountInput {
  name: string;
  benefit: DiscountBenefit;
  target: DiscountTarget;
  validFrom: string;
  validTo: string;
  weekdays: number[];
}

export type CreateDiscountOutcome = { kind: "target_not_found" } | { kind: "created"; id: string };

export async function createDiscount(
  { store }: DiscountPorts,
  input: CreateDiscountInput,
): Promise<CreateDiscountOutcome> {
  return store.transaction<CreateDiscountOutcome>(async (tx) => {
    // Locks the target so it cannot be deactivated while the discount that points at it is written.
    const locked = await tx.lockAssignableTarget(input.target);
    if (locked.kind === "not_found") {
      return { kind: "target_not_found" };
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
