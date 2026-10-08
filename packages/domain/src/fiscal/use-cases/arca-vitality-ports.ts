import type { Clock } from "../../shared/index.js";
import type { ArcaVitalityAnswer } from "../model/arca-reachability.js";

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
