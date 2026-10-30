import type { ReportPeriod } from "../../shared/index.js";
import type { RecordedAiCall } from "../model/ai-cost-report.js";

export interface AiCostReportQuery {
  locationId: string;
  range: ReportPeriod;
}

export interface AiCostReportReader {
  // The calls recorded on the days of the range, in the branch, those of failed and cut short
  // calls included.
  recordedCalls(query: AiCostReportQuery): Promise<RecordedAiCall[]>;
}
