import type { Clock } from "../../shared/index.js";
import type { AlertConditionObservation } from "../model/alert-condition-observation.js";

export interface BranchExpiryWindow {
  locationId: string;
  windowDays: number;
}

export interface BranchExpiryWindowReader {
  branchExpiryWindows(): Promise<BranchExpiryWindow[]>;
}

export interface ExpiringLotCandidate {
  expiresOn: string | null;
  technical: boolean;
  remaining: number;
}

export interface BranchExpiringLotReader {
  lotsExpiringBy(locationId: string, lastDay: string): Promise<ExpiringLotCandidate[]>;
}

export interface ExpiringLotAlerts {
  openAlertScopes(): Promise<string[]>;
  observeAlertCondition(observation: AlertConditionObservation): Promise<void>;
}

export interface ExpiringLotDetectionPorts {
  branches: BranchExpiryWindowReader;
  lots: BranchExpiringLotReader;
  alerts: ExpiringLotAlerts;
  clock: Clock;
}
