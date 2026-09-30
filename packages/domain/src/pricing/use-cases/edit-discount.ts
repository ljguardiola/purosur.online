import type { DiscountBenefit } from "../model/discount-benefit.js";
import type { DiscountTarget } from "../model/discount-target.js";
import { normalizeDiscountWeekdays } from "../model/discount-weekdays.js";
import type { DiscountPorts } from "./discount-store.js";

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
  | { kind: "target_not_found" }
  | { kind: "applied"; version: number };

export async function editDiscount(
  { store }: DiscountPorts,
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
    if (targetChanged && (await tx.lockAssignableTarget(fields.target)).kind === "not_found") {
      return { kind: "target_not_found" };
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
