import type { ReportPeriod } from "../../shared/index.js";
import type { SaleLinesGroup } from "../model/hand-typed-weights-report.js";

export interface HandTypedWeightsQuery {
  locationId: string;
  range: ReportPeriod;
  registerId: string | undefined;
}

export interface HandTypedWeightsReportReader {
  completedSaleLinesByWeightSource(query: HandTypedWeightsQuery): Promise<SaleLinesGroup[]>;
}
