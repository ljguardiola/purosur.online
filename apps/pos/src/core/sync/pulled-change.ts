import type { SyncChange } from "@purosur/contracts";

export interface RegisterPulledChange {
  changeSeq: number;
  change: SyncChange;
}
