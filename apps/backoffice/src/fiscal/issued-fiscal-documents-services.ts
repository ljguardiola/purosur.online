import type { IssuedFiscalDocumentPanelServices } from "./issued-fiscal-document-panel";
import {
  fetchFiscalRegisters,
  fetchIssuedFiscalDocument,
  fetchIssuedFiscalDocuments,
} from "./issued-fiscal-documents-api";
import { fetchIssuedFiscalDocumentsReport } from "./issued-fiscal-documents-report-api";

export type IssuedFiscalDocumentsScreenServices = {
  fetchIssuedFiscalDocuments: typeof fetchIssuedFiscalDocuments;
  fetchFiscalRegisters: typeof fetchFiscalRegisters;
  fetchIssuedFiscalDocumentsReport: typeof fetchIssuedFiscalDocumentsReport;
} & IssuedFiscalDocumentPanelServices;

export const defaultIssuedFiscalDocumentsScreenServices: IssuedFiscalDocumentsScreenServices = {
  fetchIssuedFiscalDocuments,
  fetchIssuedFiscalDocument,
  fetchFiscalRegisters,
  fetchIssuedFiscalDocumentsReport,
};
