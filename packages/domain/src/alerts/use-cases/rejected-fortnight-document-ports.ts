import type { FiscalDocumentType, Fortnight } from "../../fiscal/index.js";
import type { AlertConditionObservation } from "../model/alert-condition-observation.js";

export interface RejectedFortnightDocumentCandidate {
  pointOfSaleNumber: number;
  registerId: string;
  fortnight: Fortnight;
  documentType: FiscalDocumentType;
  rejectedNumber: number;
}

export interface RejectedFortnightDocumentCandidateReader {
  presentationsAwaitingRemedy(): Promise<RejectedFortnightDocumentCandidate[]>;
}

export interface RejectedFortnightDocumentAlerts {
  rejectedDocumentAlertScopes(): Promise<string[]>;
  observeAlertCondition(observation: AlertConditionObservation): Promise<void>;
}

export interface RejectedFortnightDocumentDetectionPorts {
  presentations: RejectedFortnightDocumentCandidateReader;
  alerts: RejectedFortnightDocumentAlerts;
}
