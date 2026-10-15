import type { Fortnight } from "../../fiscal/index.js";
import type { OpenAlertInput } from "../model/alert-details.js";

export interface FortnightPresentationNeedingRegularization {
  pointOfSaleNumber: number;
  registerId: string;
  fortnight: Fortnight;
}

export interface FortnightRegularizationReader {
  presentationsNeedingRegularization(): Promise<FortnightPresentationNeedingRegularization[]>;
}

export interface FortnightReportRegularizationAlerts {
  hasOpenedRegularizationAlert(scope: string): Promise<boolean>;
  openRegularizationAlert(alert: OpenAlertInput): Promise<void>;
}

export interface FortnightReportRegularizationDetectionPorts {
  presentations: FortnightRegularizationReader;
  alerts: FortnightReportRegularizationAlerts;
}
