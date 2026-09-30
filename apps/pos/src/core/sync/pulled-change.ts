import type { SyncChange } from "@purosur/contracts";

export interface RegisterPulledChange {
  changeSeq: number;
  change: SyncChange;
}

export type RemovalOf<TRemoved extends string> = Omit<
  Extract<SyncChange, { entity: "removal" }>,
  "removed_entity"
> & { removed_entity: TRemoved };
