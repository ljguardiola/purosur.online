import { fetchIssuedFiscalDocumentsReport } from "./issued-fiscal-documents-report-api";

export type IssuedFiscalDocumentsReportScreenServices = {
  fetchIssuedFiscalDocumentsReport: typeof fetchIssuedFiscalDocumentsReport;
};

export const defaultIssuedFiscalDocumentsReportScreenServices: IssuedFiscalDocumentsReportScreenServices =
  { fetchIssuedFiscalDocumentsReport };
