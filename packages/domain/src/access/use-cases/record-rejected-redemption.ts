import type { RecoveryRedemptionStore, RejectedRedemption } from "./recovery-redemption-store.js";

export interface RecordRejectedRedemptionPorts {
  store: RecoveryRedemptionStore;
}

export function recordRejectedRedemption(
  { store }: RecordRejectedRedemptionPorts,
  rejection: RejectedRedemption,
): Promise<void> {
  return store.recordRejectedRedemption(rejection);
}
