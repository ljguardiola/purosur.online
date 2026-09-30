import type { DiscountBenefit } from "../model/discount-benefit.js";
import type { DiscountTarget } from "../model/discount-target.js";

export interface DiscountPorts {
  store: DiscountStore;
}

export interface DiscountFields {
  name: string;
  benefit: DiscountBenefit;
  target: DiscountTarget;
  validFrom: string;
  validTo: string;
  weekdays: number[];
  active: boolean;
  version: number;
}

export type LockAssignableTargetResult = { kind: "not_found" } | { kind: "locked" };

export type LockDiscountResult =
  | { kind: "not_found" }
  | { kind: "locked"; discount: DiscountFields };

export interface DiscountStore {
  transaction<TOutcome>(
    work: (tx: DiscountStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface DiscountStoreTransaction {
  lockAssignableTarget(target: DiscountTarget): Promise<LockAssignableTargetResult>;
  insertDiscount(discount: DiscountFields): Promise<{ id: string }>;
  lockDiscount(id: string): Promise<LockDiscountResult>;
  updateDiscount(id: string, discount: DiscountFields): Promise<void>;
}
