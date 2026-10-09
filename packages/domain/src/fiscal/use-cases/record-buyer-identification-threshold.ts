import { argentinaCalendarDay } from "../../shared/index.js";
import {
  type BuyerIdentificationThreshold,
  isLowerThanInEffect,
  startsFromToday,
} from "../model/buyer-identification-threshold.js";
import type { BuyerIdentificationThresholdPorts } from "./buyer-identification-threshold-store.js";

export interface RecordBuyerIdentificationThresholdInput {
  amount: number;
  validFrom: string;
  actorId: string;
  confirmedLowerThanInEffect: boolean;
}

export type RecordBuyerIdentificationThresholdOutcome =
  | { kind: "recorded"; threshold: BuyerIdentificationThreshold }
  | { kind: "before_today"; today: string }
  | {
      kind: "needs_confirmation";
      inEffectAmount: number;
      amount: number;
      validFrom: string;
    };

export async function recordBuyerIdentificationThreshold(
  { store, clock }: BuyerIdentificationThresholdPorts,
  input: RecordBuyerIdentificationThresholdInput,
): Promise<RecordBuyerIdentificationThresholdOutcome> {
  const today = argentinaCalendarDay(clock.now());
  return store.transaction<RecordBuyerIdentificationThresholdOutcome>(async (tx) => {
    if (!startsFromToday(input.validFrom, today)) {
      return { kind: "before_today", today };
    }

    await tx.lockBuyerIdentificationThresholds();
    const replaced = await tx.readThresholdStartingOn(input.validFrom);
    const inEffect = await tx.readThresholdInEffectOn(today);
    if (
      inEffect &&
      isLowerThanInEffect(input.amount, inEffect) &&
      !input.confirmedLowerThanInEffect
    ) {
      return {
        kind: "needs_confirmation",
        inEffectAmount: inEffect.amount,
        amount: input.amount,
        validFrom: input.validFrom,
      };
    }

    const threshold = await tx.recordBuyerIdentificationThreshold({
      amount: input.amount,
      validFrom: input.validFrom,
      revision: replaced === undefined ? 0 : replaced.revision + 1,
      actorId: input.actorId,
      replaced,
    });
    return { kind: "recorded", threshold };
  });
}
