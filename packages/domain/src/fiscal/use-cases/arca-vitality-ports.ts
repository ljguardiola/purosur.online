import type { ArcaVitalityAnswer } from "../model/arca-reachability.js";
import type { Clock } from "./arca-certificate-expiry-store.js";

export type ArcaVitalityResult =
  | ({ kind: "answered" } & ArcaVitalityAnswer)
  | { kind: "unreachable" };

export interface VitalityCheckRecord {
  checkedAt: Date;
  ok: boolean;
}

export interface ArcaVitalityService {
  check(): Promise<ArcaVitalityResult>;
}

export interface ArcaVitalityStore {
  recordVitalityCheck(check: VitalityCheckRecord): Promise<void>;
}

export interface ArcaVitalityPorts {
  vitality: ArcaVitalityService;
  store: ArcaVitalityStore;
  clock: Clock;
}
