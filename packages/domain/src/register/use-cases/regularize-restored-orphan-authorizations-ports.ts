import type { RestorationProtocolEvidence } from "./restoration-protocol-evidence.js";

export type OrphanSweepAnswer<TFailure> =
  | { kind: "swept" }
  | { kind: "numbering_not_reconciled" }
  | { kind: "failed"; failure: TFailure };

export interface OrphanSweepRequester<TFailure> {
  requestSweep(): Promise<OrphanSweepAnswer<TFailure>>;
}

export interface AwaitedOrphanSweep {
  clear(): Promise<void>;
}

export interface RegularizeRestoredOrphanAuthorizationsPorts<TFailure> {
  evidence: RestorationProtocolEvidence;
  cloud: OrphanSweepRequester<TFailure>;
  awaited: AwaitedOrphanSweep;
}
