import type { ReportPeriod } from "../../shared/index.js";
import type { IssuedDocumentKind, IssuedDocumentState } from "../model/issued-fiscal-document.js";

export interface IssuedFiscalDocumentsQuery {
  locationId: string;
  range: ReportPeriod;
  registerId: string | undefined;
  kind: IssuedDocumentKind | undefined;
  number: number | undefined;
  page: { number: number; size: number };
}

export interface IssuedFiscalDocumentVoucher {
  voucherType: number;
  pointOfSale: number;
  number: number;
}

export type IssuedFiscalDocumentAuthorization =
  | { kind: "cae"; code: string; dueOn: string }
  | { kind: "caea"; code: string; fortnightStart: string; fortnightEnd: string };

export interface IssuedFiscalDocument extends IssuedFiscalDocumentVoucher {
  kind: IssuedDocumentKind;
  issuedOn: string;
  issuedAt: Date;
  register: { id: string; name: string };
  authorization: IssuedFiscalDocumentAuthorization | null;
  state: IssuedDocumentState;
  contingency: boolean;
  total: number;
  correctedVoucher: IssuedFiscalDocumentVoucher | null;
}

export interface IssuedFiscalDocumentsPage {
  documents: IssuedFiscalDocument[];
  total: number;
}

export interface IssuedFiscalDocumentsReader {
  issuedInPeriod(query: IssuedFiscalDocumentsQuery): Promise<IssuedFiscalDocumentsPage>;
}
