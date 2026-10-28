import {
  fetchFiscalRegisters,
  fetchIssuedFiscalDocument,
  fetchIssuedFiscalDocuments,
} from "./issued-fiscal-documents-api";

export type IssuedFiscalDocumentsScreenServices = {
  fetchIssuedFiscalDocuments: typeof fetchIssuedFiscalDocuments;
  fetchIssuedFiscalDocument: typeof fetchIssuedFiscalDocument;
  fetchFiscalRegisters: typeof fetchFiscalRegisters;
};

export const defaultIssuedFiscalDocumentsScreenServices: IssuedFiscalDocumentsScreenServices = {
  fetchIssuedFiscalDocuments,
  fetchIssuedFiscalDocument,
  fetchFiscalRegisters,
};
