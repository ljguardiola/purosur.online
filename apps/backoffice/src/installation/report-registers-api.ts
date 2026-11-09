import { type ReportRegisterListBody, reportRegisterListSchema } from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { readCloudJson } from "../platform/read-cloud-json";

export function fetchReportRegisters(): Promise<CloudReadOutcome<ReportRegisterListBody>> {
  return readCloudJson("/api/reports/registers", reportRegisterListSchema);
}
