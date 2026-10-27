import type { ReportPeriod } from "../../shared/index.js";
import type { LossRecord } from "../model/losses-by-reason.js";

export interface LossQuery {
  locationId: string;
  range: ReportPeriod;
}

export interface LossReader {
  lossesRecorded(query: LossQuery): Promise<LossRecord[]>;
}
