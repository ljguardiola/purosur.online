import type { ReportPeriod } from "../../shared/index.js";
import type { RemovalFacts } from "../model/removed-lines-and-cancelled-sales-report.js";

export interface RemovedLinesAndCancelledSalesQuery {
  locationId: string;
  range: ReportPeriod;
  registerId: string | undefined;
}

export interface RemovedLinesAndCancelledSalesReportReader {
  removalFacts(query: RemovedLinesAndCancelledSalesQuery): Promise<RemovalFacts>;
}
