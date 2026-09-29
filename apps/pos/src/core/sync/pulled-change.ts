import type { SyncPulledChange } from "@purosur/contracts";

export interface RegisterPulledChange {
  changeSeq: number;
  change: SyncPulledChange;
}
