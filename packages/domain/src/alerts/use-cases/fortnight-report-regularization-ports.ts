import type { Fortnight } from "../../fiscal/index.js";
import type { OpenAlertInput } from "../model/alert-details.js";

export interface FortnightRegularizationCandidate {
  pointOfSaleNumber: number;
  registerId: string;
  fortnight: Fortnight;
}

export interface FortnightRegularizationCandidateReader {
  presentationsNeedingRegularization(): Promise<FortnightRegularizationCandidate[]>;
}

export interface FortnightReportRegularizationAlerts {
  hasOpenedRegularizationAlert(scope: string): Promise<boolean>;
  openRegularizationAlert(alert: OpenAlertInput): Promise<void>;
}

export interface FortnightReportRegularizationDetectionPorts {
  presentations: FortnightRegularizationCandidateReader;
  alerts: FortnightReportRegularizationAlerts;
}
