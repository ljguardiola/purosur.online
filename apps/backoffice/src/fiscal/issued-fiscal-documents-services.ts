import { fetchFiscalRegisters, fetchIssuedFiscalDocuments } from "./issued-fiscal-documents-api";

export type IssuedFiscalDocumentsScreenServices = {
  fetchIssuedFiscalDocuments: typeof fetchIssuedFiscalDocuments;
  fetchFiscalRegisters: typeof fetchFiscalRegisters;
};

export const defaultIssuedFiscalDocumentsScreenServices: IssuedFiscalDocumentsScreenServices = {
  fetchIssuedFiscalDocuments,
  fetchFiscalRegisters,
};
