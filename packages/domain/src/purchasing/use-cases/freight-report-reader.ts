import type { ReportPeriod } from "../../shared/index.js";
import type { RegisteredFreight } from "../model/freight-by-period-report.js";

export interface FreightReportQuery {
  locationId: string;
  range: ReportPeriod;
}

export interface FreightReportReader {
  registeredFreights(query: FreightReportQuery): Promise<RegisteredFreight[]>;
}
