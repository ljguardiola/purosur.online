import type { Clock, ZoneRulesSource } from "../../shared/index.js";
import { hasPurchaseLines, isPurchaseDateInFuture } from "../model/purchase.js";
import type {
  LineRefusal,
  RegisteredPurchaseLine,
  RegisterPurchaseLine,
} from "./purchase-line-resolution.js";
import {
  type PurchaseToRecord,
  type RecordedPurchase,
  recordPurchase,
} from "./purchase-recording.js";
import type { PurchasingStore } from "./purchasing-store.js";

export type { RegisteredPurchaseLine, RegisterPurchaseLine };

export type RegisterPurchaseInput = PurchaseToRecord;

export interface RegisterPurchasePorts {
  store: PurchasingStore;
  clock: Clock;
  zoneRules: ZoneRulesSource;
}

export type RegisteredPurchase = RecordedPurchase;

export type RegisterPurchaseOutcome =
  | { kind: "no_lines" }
  | { kind: "date_in_future" }
  | { kind: "supplier_not_found" }
  | { kind: "supplier_inactive" }
  | LineRefusal
  | { kind: "registered"; purchase: RegisteredPurchase };

export async function registerPurchase(
  { store, clock, zoneRules }: RegisterPurchasePorts,
  input: RegisterPurchaseInput,
): Promise<RegisterPurchaseOutcome> {
  if (!hasPurchaseLines(input.lines.length)) {
    return { kind: "no_lines" };
  }
  const recordedAt = clock.now();
  if (isPurchaseDateInFuture(input.purchasedOn, recordedAt, zoneRules.zoneRules())) {
    return { kind: "date_in_future" };
  }

  return store.transaction<RegisterPurchaseOutcome>(async (tx) => {
    const recording = await recordPurchase(tx, input, recordedAt);
    return recording.kind === "recorded"
      ? { kind: "registered", purchase: recording.purchase }
      : recording;
  });
}
