import {
  fortnightReportNeedsRegularizationAlert,
  pointOfSaleFortnightScope,
} from "../model/fortnight-report-alerts.js";
import type { FortnightReportRegularizationDetectionPorts } from "./fortnight-report-regularization-ports.js";

export async function detectFortnightReportRegularizations({
  presentations,
  alerts,
}: FortnightReportRegularizationDetectionPorts): Promise<number> {
  let opened = 0;
  for (const presentation of await presentations.presentationsNeedingRegularization()) {
    const scope = pointOfSaleFortnightScope(
      presentation.pointOfSaleNumber,
      presentation.fortnight.start,
    );
    if (!(await alerts.hasOpenedRegularizationAlert(scope))) {
      await alerts.openRegularizationAlert(fortnightReportNeedsRegularizationAlert(presentation));
      opened += 1;
    }
  }
  return opened;
}
