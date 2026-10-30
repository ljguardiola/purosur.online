import { fetchAiCostReport } from "./ai-cost-report-api";

export type AiCostReportScreenServices = {
  fetchAiCostReport: typeof fetchAiCostReport;
};

export const defaultAiCostReportScreenServices: AiCostReportScreenServices = {
  fetchAiCostReport,
};
