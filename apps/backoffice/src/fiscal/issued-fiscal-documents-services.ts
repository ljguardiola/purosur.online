import type { IssuedFiscalDocumentDetailModalServices } from "./issued-fiscal-document-detail-modal";
import {
  fetchFiscalRegisters,
  fetchIssuedFiscalDocument,
  fetchIssuedFiscalDocuments,
} from "./issued-fiscal-documents-api";

export type IssuedFiscalDocumentsScreenServices = {
  fetchIssuedFiscalDocuments: typeof fetchIssuedFiscalDocuments;
  fetchFiscalRegisters: typeof fetchFiscalRegisters;
} & IssuedFiscalDocumentDetailModalServices;

export const defaultIssuedFiscalDocumentsScreenServices: IssuedFiscalDocumentsScreenServices = {
  fetchIssuedFiscalDocuments,
  fetchIssuedFiscalDocument,
  fetchFiscalRegisters,
};
